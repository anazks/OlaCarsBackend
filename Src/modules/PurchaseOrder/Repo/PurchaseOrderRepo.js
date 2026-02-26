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
 * @returns {Promise<Array>}
 */
exports.getPurchaseOrdersService = async (query = {}) => {
    try {
        return await PurchaseOrder.find(query).populate("branch");
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
        return await PurchaseOrder.findById(id).populate("branch");
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
