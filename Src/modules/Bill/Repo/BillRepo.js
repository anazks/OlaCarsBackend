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

exports.getAllBills = async (query = {}) => {
    return await Bill.find(query)
        .populate("supplier", "name")
        .populate("branch", "name")
        .populate("taxId")
        .sort({ billDate: -1, createdAt: -1 })
        .lean();
};

exports.getAllBillsPaginated = async (query = {}, page = 1, limit = 10) => {
    const skip = (page - 1) * limit;
    const totalItems = await Bill.countDocuments(query);
    const totalPages = Math.ceil(totalItems / limit);
    
    const data = await Bill.find(query)
        .populate("supplier", "name")
        .populate("branch", "name")
        .populate("taxId")
        .sort({ billDate: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean();
        
    return {
        data,
        pagination: {
            totalItems,
            totalPages,
            currentPage: page,
            limit
        }
    };
};

exports.updateBill = async (id, data) => {
    return await Bill.findByIdAndUpdate(id, data, { new: true, runValidators: true });
};

exports.getBillByPO = async (poId) => {
    return await Bill.findOne({ purchaseOrder: poId });
};
