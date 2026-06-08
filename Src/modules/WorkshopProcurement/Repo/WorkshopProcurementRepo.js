const WorkshopProcurement = require("../Model/WorkshopProcurementModel.js");

exports.addProcurementRequest = async (data) => {
    return await WorkshopProcurement.create(data);
};

exports.getProcurementRequests = async (query = {}, options = {}) => {
    const { applyQueryFeatures } = require("../../../shared/utils/queryHelper");
    const queryOptions = {
        populate: [
            { path: "part", select: "partName partNumber unitCost unit" },
            { path: "branch", select: "name" },
            { path: "requestedBy", select: "fullName" },
            { path: "approvedBy", select: "fullName" },
            { path: "supplier", select: "name" }
        ],
        filterFields: ["status", "branch", "requestedBy", "approvedBy"],
        searchFields: ["requestNumber", "notes"],
        dateFilterField: "createdAt",
        ...options
    };
    return await applyQueryFeatures(WorkshopProcurement, query, queryOptions);
};

exports.getProcurementRequestById = async (id) => {
    return await WorkshopProcurement.findById(id)
        .populate("part")
        .populate("branch")
        .populate("requestedBy", "fullName")
        .populate("supplier")
        .populate({
            path: "ledgerEntries",
            populate: [
                { path: "accountingCode", select: "code name category" },
                { path: "taxInfo.taxApplied", select: "name rate" }
            ]
        });
};

exports.updateProcurementRequest = async (id, data) => {
    console.log("[DEBUG] updateProcurementRequest id:", id, "data:", data);
    return await WorkshopProcurement.findByIdAndUpdate(id, data, { new: true });
};
