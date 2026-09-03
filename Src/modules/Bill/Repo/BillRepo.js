const Bill = require("../Model/BillModel");

exports.createBill = async (data) => {
    return await Bill.create(data);
};

exports.getBillById = async (id) => {
    const bill = await Bill.findById(id)
        .populate("supplier")
        .populate("branch")
        .populate("purchaseOrder")
        .populate("taxId")
        .populate("creditAccountId")
        .populate("items.accountId");

    if (!bill) return null;

    const LedgerEntry = require("../../Ledger/Model/LedgerEntryModel");
    
    // Collect transaction IDs from bill payments
    const paymentTxIds = (bill.payments || [])
        .map(p => p.transactionId ? String(p.transactionId).trim() : null)
        .filter(Boolean);

    const queryOr = [
        { bill: bill._id },
        { "bills.billId": bill._id },
        { description: new RegExp(`\\b${bill.billNumber.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, "i") }
    ];

    if (paymentTxIds.length > 0) {
        queryOr.push({ transactionId: { $in: paymentTxIds } });
    }

    const allEntries = await LedgerEntry.find({
        $or: queryOr,
        isDeleted: { $ne: true }
    })
    .populate("accountingCode", "code name category accountType")
    .sort({ entryDate: 1, createdAt: 1 })
    .lean();

    // Filter out entries that explicitly belong to a different bill ID
    const validEntries = allEntries.filter(entry => {
        if (entry.bill && entry.bill.toString() !== bill._id.toString()) {
            return false;
        }
        return true;
    });

    const billObj = bill.toObject ? bill.toObject() : bill;
    billObj.ledgerEntries = validEntries;
    return billObj;
};

exports.getAllBills = async (query = {}, hasDateFilter = false) => {
    const mongoose = require("mongoose");
    const metricsQuery = { ...query };
    if (metricsQuery.supplier && typeof metricsQuery.supplier === 'string' && mongoose.Types.ObjectId.isValid(metricsQuery.supplier)) {
        metricsQuery.supplier = new mongoose.Types.ObjectId(metricsQuery.supplier);
    }
    if (metricsQuery.branch && typeof metricsQuery.branch === 'string' && mongoose.Types.ObjectId.isValid(metricsQuery.branch)) {
        metricsQuery.branch = new mongoose.Types.ObjectId(metricsQuery.branch);
    }
    if (metricsQuery.$or && Array.isArray(metricsQuery.$or)) {
        metricsQuery.$or = metricsQuery.$or.map(clause => {
            if (clause.supplier && clause.supplier.$in && Array.isArray(clause.supplier.$in)) {
                return {
                    ...clause,
                    supplier: {
                        $in: clause.supplier.$in.map(id => typeof id === 'string' && mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : id)
                    }
                };
            }
            return clause;
        });
    }

    const [stats, data] = await Promise.all([
        Bill.aggregate([
            { $match: metricsQuery },
            {
                $group: {
                    _id: null,
                    totalGrossBilled: { $sum: "$totalAmount" },
                    totalNetSettled: { $sum: "$amountPaid" },
                    totalCurrentBalance: { $sum: "$balanceDue" },
                    openCount: { $sum: { $cond: [{ $eq: ["$status", "OPEN"] }, 1, 0] } },
                    partialCount: { $sum: { $cond: [{ $eq: ["$status", "PARTIALLY_PAID"] }, 1, 0] } },
                    paidCount: { $sum: { $cond: [{ $eq: ["$status", "PAID"] }, 1, 0] } }
                }
            }
        ]),
        Bill.find(query)
            .populate("supplier", "name")
            .populate("branch", "name")
            .populate("taxId")
            .sort({ billDate: -1, createdAt: -1 })
            .lean()
    ]);

    const metrics = (stats && stats.length > 0) ? {
        totalGrossBilled: stats[0].totalGrossBilled || 0,
        totalNetSettled: stats[0].totalNetSettled || 0,
        totalCurrentBalance: stats[0].totalCurrentBalance || 0,
        totalBilled: stats[0].totalGrossBilled || 0,
        totalBalanceDue: stats[0].totalCurrentBalance || 0,
        openCount: stats[0].openCount || 0,
        partialCount: stats[0].partialCount || 0,
        paidCount: stats[0].paidCount || 0,
        isFilteredPeriod: hasDateFilter
    } : {
        totalGrossBilled: 0,
        totalNetSettled: 0,
        totalCurrentBalance: 0,
        totalBilled: 0,
        totalBalanceDue: 0,
        openCount: 0,
        partialCount: 0,
        paidCount: 0,
        isFilteredPeriod: hasDateFilter
    };

    return {
        data,
        metrics
    };
};

exports.getAllBillsPaginated = async (query = {}, page = 1, limit = 10, hasDateFilter = false) => {
    const mongoose = require("mongoose");
    const skip = (page - 1) * limit;

    const metricsQuery = { ...query };
    if (metricsQuery.supplier && typeof metricsQuery.supplier === 'string' && mongoose.Types.ObjectId.isValid(metricsQuery.supplier)) {
        metricsQuery.supplier = new mongoose.Types.ObjectId(metricsQuery.supplier);
    }
    if (metricsQuery.branch && typeof metricsQuery.branch === 'string' && mongoose.Types.ObjectId.isValid(metricsQuery.branch)) {
        metricsQuery.branch = new mongoose.Types.ObjectId(metricsQuery.branch);
    }
    if (metricsQuery.$or && Array.isArray(metricsQuery.$or)) {
        metricsQuery.$or = metricsQuery.$or.map(clause => {
            if (clause.supplier && clause.supplier.$in && Array.isArray(clause.supplier.$in)) {
                return {
                    ...clause,
                    supplier: {
                        $in: clause.supplier.$in.map(id => typeof id === 'string' && mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : id)
                    }
                };
            }
            return clause;
        });
    }

    const [totalItems, stats, data] = await Promise.all([
        Bill.countDocuments(query),
        Bill.aggregate([
            { $match: metricsQuery },
            {
                $group: {
                    _id: null,
                    totalGrossBilled: { $sum: "$totalAmount" },
                    totalNetSettled: { $sum: "$amountPaid" },
                    totalCurrentBalance: { $sum: "$balanceDue" },
                    openCount: { $sum: { $cond: [{ $eq: ["$status", "OPEN"] }, 1, 0] } },
                    partialCount: { $sum: { $cond: [{ $eq: ["$status", "PARTIALLY_PAID"] }, 1, 0] } },
                    paidCount: { $sum: { $cond: [{ $eq: ["$status", "PAID"] }, 1, 0] } }
                }
            }
        ]),
        Bill.find(query)
            .populate("supplier", "name")
            .populate("branch", "name")
            .populate("taxId")
            .sort({ billDate: -1, createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean()
    ]);

    const totalPages = Math.ceil(totalItems / limit) || 1;

    const metrics = (stats && stats.length > 0) ? {
        totalGrossBilled: stats[0].totalGrossBilled || 0,
        totalNetSettled: stats[0].totalNetSettled || 0,
        totalCurrentBalance: stats[0].totalCurrentBalance || 0,
        totalBilled: stats[0].totalGrossBilled || 0,
        totalBalanceDue: stats[0].totalCurrentBalance || 0,
        openCount: stats[0].openCount || 0,
        partialCount: stats[0].partialCount || 0,
        paidCount: stats[0].paidCount || 0,
        isFilteredPeriod: hasDateFilter
    } : {
        totalGrossBilled: 0,
        totalNetSettled: 0,
        totalCurrentBalance: 0,
        totalBilled: 0,
        totalBalanceDue: 0,
        openCount: 0,
        partialCount: 0,
        paidCount: 0,
        isFilteredPeriod: hasDateFilter
    };

    return {
        data,
        pagination: {
            totalItems,
            totalPages,
            currentPage: page,
            limit
        },
        metrics
    };
};

exports.updateBill = async (id, data) => {
    return await Bill.findByIdAndUpdate(id, data, { new: true, runValidators: true });
};

exports.getBillByPO = async (poId) => {
    return await Bill.findOne({ purchaseOrder: poId });
};
