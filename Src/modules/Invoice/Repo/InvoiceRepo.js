const mongoose = require("mongoose");
const { Invoice } = require("../Model/InvoiceModel");

exports.addInvoiceService = async (data, session = null) => {
    const options = session ? { session } : {};
    const invoices = await Invoice.create([data], options);
    return invoices[0];
};

exports.addManyInvoicesService = async (dataArray, session = null) => {
    const options = session ? { session } : {};
    return await Invoice.insertMany(dataArray, options);
};

exports.getInvoicesService = async (queryParams = {}, options = {}) => {
    const page = parseInt(queryParams.page) || 1;
    const limit = parseInt(queryParams.limit) || 20;
    const skip = (page - 1) * limit;

    const pipeline = [
        { $match: { isDeleted: false } }
    ];

    // Date Range Filter
    if (queryParams.startDate || queryParams.endDate) {
        const dateQuery = {};
        if (queryParams.startDate) dateQuery.$gte = new Date(queryParams.startDate);
        if (queryParams.endDate) {
            const end = new Date(queryParams.endDate);
            end.setHours(23, 59, 59, 999);
            dateQuery.$lte = end;
        }
        pipeline.push({ $match: { dueDate: dateQuery } });
    }

    // Status Filter
    if (queryParams.status && queryParams.status !== 'ALL') {
        pipeline.push({ $match: { status: queryParams.status } });
    }

    // Driver/Vehicle direct ID filters
    if (queryParams.driver) pipeline.push({ $match: { driver: new mongoose.Types.ObjectId(queryParams.driver) } });
    if (queryParams.vehicle) pipeline.push({ $match: { vehicle: new mongoose.Types.ObjectId(queryParams.vehicle) } });

    // Search Filter (Invoice Number or Driver Name)
    if (queryParams.search) {
        pipeline.push(
            {
                $lookup: {
                    from: 'drivers',
                    localField: 'driver',
                    foreignField: '_id',
                    as: 'driverInfo'
                }
            },
            { $unwind: '$driverInfo' },
            {
                $match: {
                    $or: [
                        { invoiceNumber: { $regex: queryParams.search, $options: 'i' } },
                        { 'driverInfo.personalInfo.fullName': { $regex: queryParams.search, $options: 'i' } },
                        { 'driverInfo.personalInfo.email': { $regex: queryParams.search, $options: 'i' } }
                    ]
                }
            }
        );
    } else {
        // If no search, still need to populate driver for the response
        pipeline.push(
            {
                $lookup: {
                    from: 'drivers',
                    localField: 'driver',
                    foreignField: '_id',
                    as: 'driverInfo'
                }
            },
            { $unwind: '$driverInfo' }
        );
    }

    // Lookup Vehicle info
    pipeline.push(
        {
            $lookup: {
                from: 'vehicles',
                localField: 'vehicle',
                foreignField: '_id',
                as: 'vehicleInfo'
            }
        },
        { $unwind: { path: '$vehicleInfo', preserveNullAndEmptyArrays: true } }
    );

    // Sort, skip, limit
    const sortField = options.defaultSort ? Object.keys(options.defaultSort)[0] : 'weekNumber';
    const sortOrder = options.defaultSort ? Object.values(options.defaultSort)[0] : 1;

    pipeline.push(
        {
            $facet: {
                metadata: [{ $count: 'total' }],
                data: [
                    { $sort: { [sortField]: sortOrder } },
                    { $skip: skip },
                    { $limit: limit },
                    {
                        $project: {
                            invoiceNumber: 1,
                            weekNumber: 1,
                            weekLabel: 1,
                            dueDate: 1,
                            baseAmount: 1,
                            carryOverAmount: 1,
                            totalAmountDue: 1,
                            amountPaid: 1,
                            balance: 1,
                            status: 1,
                            paidAt: 1,
                            payments: 1,
                            generatedAt: 1,
                            driver: {
                                _id: '$driverInfo._id',
                                personalInfo: '$driverInfo.personalInfo'
                            },
                            vehicle: {
                                _id: '$vehicleInfo._id',
                                basicDetails: '$vehicleInfo.basicDetails',
                                legalDocs: '$vehicleInfo.legalDocs'
                            }
                        }
                    }
                ]
            }
        }
    );

    const result = await Invoice.aggregate(pipeline);
    const totalCount = result[0].metadata[0]?.total || 0;
    const data = result[0].data || [];

    return {
        data,
        pagination: {
            totalItems: totalCount,
            totalPages: Math.ceil(totalCount / limit),
            currentPage: page,
            limit,
        },
    };
};

exports.getInvoiceByIdService = async (id) => {
    const invoice = await Invoice.findById(id)
        .populate("driver", "personalInfo.fullName personalInfo.email personalInfo.phone")
        .populate("vehicle", "basicDetails.make basicDetails.model legalDocs.registrationNumber")
        .lean();
    if (!invoice || invoice.isDeleted) throw new Error("Invoice not found");
    return invoice;
};

exports.updateInvoiceService = async (id, updateData, session = null) => {
    const options = session ? { new: true, session } : { new: true };
    const updated = await Invoice.findByIdAndUpdate(id, updateData, options);
    if (!updated || updated.isDeleted) throw new Error("Invoice not found");
    return updated;
};

exports.deleteInvoiceService = async (id) => {
    const deleted = await Invoice.findByIdAndUpdate(id, { isDeleted: true }, { new: true });
    if (!deleted) throw new Error("Invoice not found");
    return deleted;
};
