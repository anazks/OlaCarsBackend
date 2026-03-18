const PurchaseOrder = require("../Model/PurchaseOrderModel.js");

/**
 * Creates a new Purchase Order.
 * @param {Object} data - Purchase order details.
 * @returns {Promise<Object>} Added PO object.
 */
exports.addPurchaseOrderService = async (data) => {
    try {
        const newPO = await PurchaseOrder.create(data);
        return newPO.toObject();
    } catch (error) {
        throw error;
    }
};

/**
 * Retrieves all Purchase Orders.
 * @param {Object} query - Optional query parameters.
 * @param {number} page - Page number.
 * @param {number} limit - Items per page.
 * @param {Object} sort - Sort parameters.
 * @returns {Promise<Object>} Paginated result
 */
exports.getPurchaseOrdersService = async (query = {}, page = 1, limit = 10, sort = { createdAt: -1 }) => {
    try {
        const skip = (page - 1) * limit;

        const total = await PurchaseOrder.countDocuments(query);
        const data = await PurchaseOrder.find(query)
            .sort(sort)
            .skip(skip)
            .limit(limit)
            .populate("branch")
            .populate("supplier", "name contactPerson email");

        return {
            total,
            page: Number(page),
            limit: Number(limit),
            totalPages: Math.ceil(total / limit),
            data
        };
    } catch (error) {
        throw error;
    }
};

/**
 * Retrieves a Purchase Order by ID.
 * @param {string} id
 * @returns {Promise<Object>}
 */
exports.getPurchaseOrderByIdService = async (id) => {
    try {
        return await PurchaseOrder.findById(id)
            .populate("branch")
            .populate("supplier", "name contactPerson email")
            .populate("createdBy", "name email");
    } catch (error) {
        throw error;
    }
};

/**
 * Updates a Purchase Order (General Edit).
 * @param {string} id - PO ID.
 * @param {Object} updateData - Data to update.
 * @returns {Promise<Object>} Updated PO.
 */
exports.updatePurchaseOrderService = async (id, updateData) => {
    try {
        return await PurchaseOrder.findByIdAndUpdate(id, updateData, { new: true, runValidators: true });
    } catch (error) {
        throw error;
    }
};

/**
 * Approves or Rejects a Purchase Order.
 * @param {string} id - PO ID.
 * @param {string} status - New status (APPROVED / REJECTED).
 * @param {string} approvedBy - ID of the user approving.
 * @param {string} approverRole - Role of the user approving.
 * @returns {Promise<Object>} Updated PO.
 */
exports.updatePurchaseOrderStatusService = async (
    id,
    status,
    approvedBy,
    approverRole
) => {
    try {
        return await PurchaseOrder.findByIdAndUpdate(
            id,
            {
                status,
                approvedBy,
                approverRole,
            },
            { new: true }
        );
    } catch (error) {
        throw error;
    }
};
