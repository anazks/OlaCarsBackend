const {
    reserveStock,
    releaseStock,
    deductStock,
    deductStockDirectly,
    restockPart,
    getPartById,
    returnToStock,
} = require("../Repo/InventoryPartRepo");
const { PartTransaction } = require("../Model/PartTransactionModel");

/**
 * Helper to log an inventory transaction.
 */
const logTransaction = async (data) => {
    try {
        await PartTransaction.create({
            partId: data.partId,
            branchId: data.branchId,
            workOrderId: data.workOrderId,
            transactionType: data.transactionType,
            quantity: data.quantity,
            performedBy: data.performedBy,
            role: data.role,
            notes: data.notes,
        });
    } catch (error) {
        console.error("Failed to log inventory transaction:", error);
        // We don't throw here to avoid failing the main business logic, 
        // but in a production app you might want to ensure this is ACID.
    }
};

/**
 * Check stock and reserve parts for a work order.
 * @param {string} partId
 * @param {number} quantity
 * @param {Object} user - { id, role }
 * @param {string} workOrderId
 * @returns {Promise<Object>} Updated inventory part
 */
const checkAndReserve = async (partId, quantity, user, workOrderId = null) => {
    const part = await getPartById(partId);
    if (!part) throw new Error("Inventory part not found.", { cause: 404 });
    if (!part.isActive) throw new Error("This part has been discontinued.", { cause: 400 });

    const available = part.quantityOnHand - part.quantityReserved;
    if (available < quantity) {
        return {
            success: false,
            available,
            shortfall: quantity - available,
            part,
            message: `Insufficient stock for ${part.partName}. Available: ${available}, Need: ${quantity}.`,
        };
    }

    const updated = await reserveStock(partId, quantity);
    
    await logTransaction({
        partId,
        branchId: part.branchId?._id || part.branchId,
        workOrderId,
        transactionType: "RESERVE",
        quantity,
        performedBy: user.id,
        role: user.role,
        notes: `Reserved for work order: ${workOrderId || "N/A"}`,
    });

    return { success: true, part: updated };
};

/**
 * Release reserved stock back.
 */
const releaseReservation = async (partId, quantity, user, workOrderId = null) => {
    const part = await getPartById(partId);
    const updated = await releaseStock(partId, quantity);
    
    await logTransaction({
        partId,
        branchId: part.branchId?._id || part.branchId,
        workOrderId,
        transactionType: "RELEASE",
        quantity: -quantity,
        performedBy: user.id,
        role: user.role,
        notes: `Released reservation from work order: ${workOrderId || "N/A"}`,
    });

    return updated;
};

/**
 * Deduct stock after a part is physically installed.
 */
const confirmInstallation = async (partId, quantity, user, workOrderId = null) => {
    const part = await getPartById(partId);
    const updated = await deductStock(partId, quantity);
    
    await logTransaction({
        partId,
        branchId: part.branchId?._id || part.branchId,
        workOrderId,
        transactionType: "INSTALL",
        quantity: -quantity,
        performedBy: user.id,
        role: user.role,
        notes: `Installed in work order: ${workOrderId || "N/A"}`,
    });

    return updated;
};

/**
 * Deduct stock directly (without reservation).
 */
const confirmDirectInstallation = async (partId, quantity, user, workOrderId = null) => {
    const part = await getPartById(partId);
    const updated = await deductStockDirectly(partId, quantity);
    
    await logTransaction({
        partId,
        branchId: part.branchId?._id || part.branchId,
        workOrderId,
        transactionType: "INSTALL",
        quantity: -quantity,
        performedBy: user.id,
        role: user.role,
        notes: `Direct installation in work order: ${workOrderId || "N/A"}`,
    });

    return updated;
};

/**
 * Return parts to stock (post-installation).
 */
const confirmReturn = async (partId, quantity, user, workOrderId = null) => {
    const part = await getPartById(partId);
    const updated = await returnToStock(partId, quantity);
    
    await logTransaction({
        partId,
        branchId: part.branchId?._id || part.branchId,
        workOrderId,
        transactionType: "RETURN",
        quantity,
        performedBy: user.id,
        role: user.role,
        notes: `Returned from work order: ${workOrderId || "N/A"}`,
    });

    return updated;
};

/**
 * Receive new stock from supplier.
 */
const receiveStock = async (partId, quantity, user) => {
    const part = await getPartById(partId);
    const updated = await restockPart(partId, quantity);
    
    await logTransaction({
        partId,
        branchId: part.branchId?._id || part.branchId,
        transactionType: "RESTOCK",
        quantity,
        performedBy: user.id,
        role: user.role,
        notes: "Stock received from supplier",
    });

    return updated;
};

module.exports = {
    checkAndReserve,
    releaseReservation,
    confirmInstallation,
    confirmDirectInstallation,
    confirmReturn,
    receiveStock,
};
