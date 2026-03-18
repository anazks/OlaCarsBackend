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

const { applyQueryFeatures } = require("../../../shared/utils/queryHelper");

/**
 * Retrieves all Purchase Orders using generic query features.
 * @param {Object} queryParams - Raw query parameters from req.query.
 * @param {Object} [options={}] - Additional options like baseQuery or overrides.
 * @returns {Promise<Object>} Paginated result
 */
exports.getPurchaseOrdersService = async (queryParams = {}, options = {}) => {
    try {
        const queryOptions = {
            searchFields: ["purchaseOrderNumber", "items.itemName"],
            filterFields: ["purpose", "status", "isUsed", "isBilled", "supplier", "branch"],
            populate: [
                { path: "branch" },
                { path: "supplier", select: "name contactPerson email" }
            ],
            ...options
        };

        return await applyQueryFeatures(PurchaseOrder, queryParams, queryOptions);
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
