const mongoose = require("mongoose");
const PaymentTransaction = require("../Model/PaymentTransactionModel");

exports.addPaymentTransactionService = async (data) => {
    try {
        const newTransaction = await PaymentTransaction.create(data);
        return newTransaction.toObject();
    } catch (error) {
        throw error;
    }
};

exports.getPaymentTransactionsService = async (queryParams = {}) => {
    try {
        const page = parseInt(queryParams.page) || 1;
        const limit = parseInt(queryParams.limit) || 10;
        const skip = (page - 1) * limit;

        const pipeline = [
            { $match: { isDeleted: { $ne: true } } }
        ];

        // 1. Transaction Category Filter (Critical for Bills/Expense view)
        if (queryParams.transactionCategory) {
            pipeline.push({ $match: { transactionCategory: queryParams.transactionCategory } });
        }

        // 2. Status Filter
        if (queryParams.status && queryParams.status !== 'ALL') {
            pipeline.push({ $match: { status: queryParams.status } });
        }

        // 3. Date Range Filter (against paymentDate)
        if (queryParams.startDate || queryParams.endDate) {
            const dateQuery = {};
            if (queryParams.startDate) dateQuery.$gte = new Date(queryParams.startDate);
            if (queryParams.endDate) {
                const end = new Date(queryParams.endDate);
                end.setHours(23, 59, 59, 999);
                dateQuery.$lte = end;
            }
            pipeline.push({ $match: { paymentDate: dateQuery } });
        }

        // 4. Lookups for Search and Display
        pipeline.push(
            {
                $lookup: {
                    from: "purchaseorders",
                    localField: "referenceId",
                    foreignField: "_id",
                    as: "poInfo"
                }
            },
            { $unwind: { path: "$poInfo", preserveNullAndEmptyArrays: true } },
            {
                $lookup: {
                    from: "suppliers",
                    localField: "poInfo.supplier",
                    foreignField: "_id",
                    as: "supplierInfo"
                }
            },
            { $unwind: { path: "$supplierInfo", preserveNullAndEmptyArrays: true } },
            {
                $lookup: {
                    from: "accountingcodes",
                    localField: "accountingCode",
                    foreignField: "_id",
                    as: "accountingCodeInfo"
                }
            },
            { $unwind: { path: "$accountingCodeInfo", preserveNullAndEmptyArrays: true } }
        );

        // 5. Global Search
        if (queryParams.search) {
            const searchRegex = new RegExp(queryParams.search, 'i');
            pipeline.push({
                $match: {
                    $or: [
                        { "poInfo.purchaseOrderNumber": searchRegex },
                        { "supplierInfo.name": searchRegex },
                        { "notes": searchRegex },
                        { "paymentMethod": searchRegex }
                    ]
                }
            });
        }

        // 6. Facet for Pagination
        pipeline.push({
            $facet: {
                data: [
                    { $sort: { createdAt: -1 } },
                    { $skip: skip },
                    { $limit: limit },
                    {
                        $project: {
                            _id: 1,
                            referenceId: 1,
                            referenceModel: 1,
                            transactionCategory: 1,
                            transactionType: 1,
                            paymentMethod: 1,
                            totalAmount: 1,
                            baseAmount: 1,
                            taxAmount: 1,
                            status: 1,
                            paymentDate: 1,
                            notes: 1,
                            createdAt: 1,
                            accountingCode: "$accountingCodeInfo",
                            po: "$poInfo",
                            supplier: "$supplierInfo"
                        }
                    }
                ],
                totalCount: [
                    { $count: "count" }
                ]
            }
        });

        const result = await PaymentTransaction.aggregate(pipeline);
        
        const data = result[0].data;
        const total = result[0].totalCount[0] ? result[0].totalCount[0].count : 0;

        return {
            data,
            pagination: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit)
            }
        };
    } catch (error) {
        throw error;
    }
};

exports.getPaymentTransactionByIdService = async (id) => {
    try {
        return await PaymentTransaction.findById(id)
            .populate("accountingCode", "code name category")
            .populate("taxApplied", "name rate")
            .populate("createdBy", "name email");
    } catch (error) {
        throw error;
    }
};

exports.updatePaymentTransactionStatusService = async (id, status) => {
    try {
        return await PaymentTransaction.findByIdAndUpdate(
            id,
            { status },
            { new: true, runValidators: true }
        ).populate("accountingCode", "code name category");
    } catch (error) {
        throw error;
    }
};
