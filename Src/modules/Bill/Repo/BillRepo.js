const Bill = require("../Model/BillModel");

exports.createBill = async (data) => {
    return await Bill.create(data);
};

exports.getBillById = async (id) => {
    return await Bill.findById(id)
        .populate("supplier")
        .populate("branch")
        .populate("purchaseOrder")
        .populate("taxId")
        .populate("items.accountId");
};

exports.getAllBills = async (query = {}) => {
    return await Bill.find(query)
        .populate("supplier", "name")
        .populate("branch", "name")
        .populate("taxId")
        .sort({ billDate: -1, createdAt: -1 });
};

exports.updateBill = async (id, data) => {
    return await Bill.findByIdAndUpdate(id, data, { new: true, runValidators: true });
};

exports.getBillByPO = async (poId) => {
    return await Bill.findOne({ purchaseOrder: poId });
};
