const {
    reserveStock,
    releaseStock,
    deductStock,
    restockPart,
    getPartById,
} = require("../Repo/InventoryPartRepo");

/**
 * Check stock and reserve parts for a work order.
 * @param {string} partId - Inventory part ID
 * @param {number} quantity - Quantity needed
 * @returns {Promise<Object>} Updated inventory part
 */
const checkAndReserve = async (partId, quantity) => {
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
    return { success: true, part: updated };
};

/**
 * Release reserved stock back (e.g. work order cancelled or part no longer needed).
 */
const releaseReservation = async (partId, quantity) => {
    return await releaseStock(partId, quantity);
};

/**
 * Deduct stock after a part is physically installed.
 */
const confirmInstallation = async (partId, quantity) => {
    return await deductStock(partId, quantity);
};

/**
 * Receive new stock from supplier.
 */
const receiveStock = async (partId, quantity) => {
    return await restockPart(partId, quantity);
};

module.exports = {
    checkAndReserve,
    releaseReservation,
    confirmInstallation,
    receiveStock,
};
