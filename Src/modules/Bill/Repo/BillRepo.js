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
        .limit(limit);
        
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
