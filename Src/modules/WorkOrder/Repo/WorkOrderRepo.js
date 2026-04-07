console.log("[DEBUG] Loading WorkOrderRepo.js...");
const mongoose = require("mongoose");
const { WorkOrder } = require("../Model/WorkOrderModel");

/**
 * Retrieves all pending part requirements for a branch.
 * @param {string} branchId
 * @returns {Promise<Array>}
 */
exports.getWorkshopPartRequirements = async (branchId) => {
    try {
        const results = await WorkOrder.aggregate([
            {
                $match: {
                    branchId: new mongoose.Types.ObjectId(branchId),
                    isDeleted: false,
                    status: { $nin: ["CLOSED", "CANCELLED", "VEHICLE_RELEASED"] },
                },
            },
            {
                $lookup: {
                    from: "vehicles",
                    localField: "vehicleId",
                    foreignField: "_id",
                    as: "vehicle",
                },
            },
            { $unwind: { path: "$vehicle", preserveNullAndEmptyArrays: true } },
            {
                $addFields: {
                    vehicleLabel: {
                        $concat: [
                            { $ifNull: ["$vehicle.basicDetails.make", "Unknown"] },
                            " ",
                            { $ifNull: ["$vehicle.basicDetails.model", "Vehicle"] },
                            " (",
                            { $ifNull: ["$vehicle.legalDocs.registrationNumber", "N/A"] },
                            ")",
                        ],
                    },
                    parts: {
                        $filter: {
                            input: "$parts",
                            as: "part",
                            cond: { $in: ["$$part.status", ["REQUESTED", "RESERVED"]] },
                        },
                    },
                },
            },
            { $match: { "parts.0": { $exists: true } } },
            {
                $project: {
                    workOrderNumber: 1,
                    workOrderType: 1,
                    status: 1,
                    vehicleLabel: 1,
                    parts: 1,
                    createdAt: 1,
                },
            },
            { $sort: { createdAt: 1 } },
        ]);
        return results;
    } catch (error) {
        throw error;
    }
};

/**
 * Helper to recursively flatten an object into dot-notation for MongoDB $set.
 * Prevents full sub-document overwrites when making partial updates.
 */
const flattenForSet = (obj, parentKey = "") => {
    let result = {};
    for (const key in obj) {
        if (!obj.hasOwnProperty(key)) continue;

        const val = obj[key];
        const newKey = parentKey ? `${parentKey}.${key}` : key;

        if (
            val !== null &&
            typeof val === "object" &&
            !Array.isArray(val) &&
            !(val instanceof Date) &&
            !val._bsontype
        ) {
            Object.assign(result, flattenForSet(val, newKey));
        } else {
            result[newKey] = val;
        }
    }
    return result;
};

/**
 * Auto-generates a work order number: WO-YYYYMM-XXXX
 * @returns {Promise<string>}
 */
const generateWorkOrderNumber = async () => {
    const now = new Date();
    const prefix = `WO-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;

    const lastWO = await WorkOrder.findOne(
        { workOrderNumber: { $regex: `^${prefix}` } },
        { workOrderNumber: 1 },
        { sort: { workOrderNumber: -1 } }
    );

    let seq = 1;
    if (lastWO) {
        const lastSeq = parseInt(lastWO.workOrderNumber.split("-").pop(), 10);
        seq = (lastSeq || 0) + 1;
    }

    return `${prefix}-${String(seq).padStart(4, "0")}`;
};

/**
 * Creates a new Work Order in DRAFT status.
 * @param {Object} data
 * @returns {Promise<Object>}
 */
exports.createWorkOrder = async (data) => {
    try {
        data.workOrderNumber = await generateWorkOrderNumber();
        const wo = await WorkOrder.create(data);
        return wo.toObject();
    } catch (error) {
        throw error;
    }
};

/**
 * Retrieves work orders with optional filters.
 * @param {Object} filters - { status, branchId, vehicleId, priority, workOrderType }
 * @returns {Promise<Array>}
 */
exports.getWorkOrders = async (filters = {}) => {
    try {
        const query = { isDeleted: false };
        if (filters.status) query.status = filters.status;
        if (filters.branchId) query.branchId = filters.branchId;
        if (filters.vehicleId) query.vehicleId = filters.vehicleId;
        if (filters.priority) query.priority = filters.priority;
        if (filters.workOrderType) query.workOrderType = filters.workOrderType;

        return await WorkOrder.find(query)
            .populate("vehicleId", "basicDetails.make basicDetails.model basicDetails.vin status")
            .populate("branchId", "name")
            .populate("assignedTechnician", "name email")
            .sort({ createdAt: -1 });
    } catch (error) {
        throw error;
    }
};

/**
 * Retrieves a single Work Order by ID.
 * @param {string} id
 * @returns {Promise<Object>}
 */
exports.getWorkOrderById = async (id) => {
    try {
        return await WorkOrder.findById(id)
            .populate("vehicleId")
            .populate("branchId", "name")
            .populate("assignedTechnician", "name email")
            .populate("supervisedBy", "name email");
    } catch (error) {
        throw error;
    }
};

/**
 * Updates a Work Order record safely using flattenForSet.
 * @param {string} id - Work Order ID
 * @param {Object} updateData - Data to update
 * @param {Object} [session] - Optional MongoDB session
 * @returns {Promise<Object>}
 */
exports.updateWorkOrder = async (id, updateData, session = null) => {
    try {
        const operators = {};
        const regularFields = {};

        for (const key in updateData) {
            if (key.startsWith("$")) {
                operators[key] = updateData[key];
            } else {
                regularFields[key] = updateData[key];
            }
        }

        const flatSet = flattenForSet(regularFields);

        const finalUpdate = { ...operators };
        if (Object.keys(flatSet).length > 0) {
            finalUpdate.$set = { ...(finalUpdate.$set || {}), ...flatSet };
        }

        const options = { new: true, runValidators: true };
        if (session) options.session = session;

        return await WorkOrder.findByIdAndUpdate(id, finalUpdate, options);
    } catch (error) {
        throw error;
    }
};
