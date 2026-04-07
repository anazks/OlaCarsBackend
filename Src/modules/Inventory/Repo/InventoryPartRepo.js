const { InventoryPart } = require("../Model/InventoryPartModel");

/**
 * Helper to flatten nested objects into dot-notation for $set.
 */
const flattenForSet = (obj, parentKey = "") => {
    let result = {};
    for (const key in obj) {
        if (!obj.hasOwnProperty(key)) continue;
        const val = obj[key];
        const newKey = parentKey ? `${parentKey}.${key}` : key;
        if (val !== null && typeof val === "object" && !Array.isArray(val) && !(val instanceof Date) && !val._bsontype) {
            Object.assign(result, flattenForSet(val, newKey));
        } else {
            result[newKey] = val;
        }
    }
    return result;
};

/**
 * Create a new inventory part.
 */
exports.createPart = async (data) => {
    try {
        const part = await InventoryPart.create(data);
        return part.toObject();
    } catch (error) {
        if (error.code === 11000 && error.keyPattern && error.keyPattern.partNumber) {
            throw new Error("A part with this part number already exists.", { cause: 409 });
        }
        throw error;
    }
};

/**
 * Get all inventory parts with optional filters.
 */
exports.getParts = async (filters = {}) => {
    try {
        const query = { isActive: true };
        if (filters.branchId) query.branchId = filters.branchId;
        if (filters.category) query.category = filters.category;
        if (filters.supplierId) query.supplierId = filters.supplierId;
        if (filters.lowStock === "true") {
            query.$expr = { $lte: ["$quantityOnHand", "$reorderLevel"] };
        }
        if (filters.search) {
            query.$or = [
                { partName: { $regex: filters.search, $options: "i" } },
                { partNumber: { $regex: filters.search, $options: "i" } },
            ];
        }

        return await InventoryPart.find(query)
            .populate("branchId", "name")
            .populate("supplierId", "name")
            .sort({ partName: 1 });
    } catch (error) {
        throw error;
    }
};

/**
 * Get a single part by ID.
 */
exports.getPartById = async (id) => {
    try {
        return await InventoryPart.findById(id)
            .populate("branchId", "name")
            .populate("supplierId", "name");
    } catch (error) {
        throw error;
    }
};

/**
 * Update a part safely with flattenForSet.
 */
exports.updatePart = async (id, updateData) => {
    try {
        const flatSet = flattenForSet(updateData);
        return await InventoryPart.findByIdAndUpdate(
            id,
            { $set: flatSet },
            { new: true, runValidators: true }
        );
    } catch (error) {
        throw error;
    }
};

/**
 * Soft-delete a part (set isActive = false).
 */
exports.deletePart = async (id) => {
    try {
        return await InventoryPart.findByIdAndUpdate(
            id,
            { $set: { isActive: false } },
            { new: true }
        );
    } catch (error) {
        throw error;
    }
};

/**
 * Reserve stock for a work order (atomic).
 * @param {string} partId
 * @param {number} qty
 */
exports.reserveStock = async (partId, qty) => {
    // Atomic check: (onHand - reserved) >= qty
    const updated = await InventoryPart.findOneAndUpdate(
        { 
            _id: partId,
            $expr: { 
                $gte: [{ $subtract: ["$quantityOnHand", "$quantityReserved"] }, qty] 
            }
        },
        { $inc: { quantityReserved: qty } },
        { new: true, runValidators: true }
    );

    if (!updated) {
        // If not found, either ID is wrong or insufficient stock
        const part = await InventoryPart.findById(partId);
        if (!part) throw new Error("Inventory part not found.", { cause: 404 });
        const available = part.quantityOnHand - part.quantityReserved;
        throw new Error(`Insufficient available stock. Available: ${available}, Requested: ${qty}.`, { cause: 400 });
    }

    return updated;
};

/**
 * Release reserved stock (e.g. on WO cancellation).
 * @param {string} partId
 * @param {number} qty
 */
exports.releaseStock = async (partId, qty) => {
    const updated = await InventoryPart.findOneAndUpdate(
        { _id: partId, quantityReserved: { $gte: qty } },
        { $inc: { quantityReserved: -qty } },
        { new: true, runValidators: true }
    );

    if (!updated) {
        throw new Error("Cannot release more stock than is currently reserved.", { cause: 400 });
    }

    return updated;
};

/**
 * Deduct stock after installation (reduces both onHand and reserved).
 * @param {string} partId
 * @param {number} qty
 */
exports.deductStock = async (partId, qty) => {
    const updated = await InventoryPart.findOneAndUpdate(
        { 
            _id: partId, 
            quantityOnHand: { $gte: qty },
            quantityReserved: { $gte: qty }
        },
        { $inc: { quantityOnHand: -qty, quantityReserved: -qty } },
        { new: true, runValidators: true }
    );

    if (!updated) {
        throw new Error("Insufficient stock on hand or insufficient reservation to complete installation.", { cause: 400 });
    }

    return updated;
};

/**
 * Deduct stock directly from on-hand (no reservation check).
 * Used for parts taken from stock and installed immediately (REQUESTED -> INSTALLED).
 * @param {string} partId
 * @param {number} qty
 */
exports.deductStockDirectly = async (partId, qty) => {
    const updated = await InventoryPart.findOneAndUpdate(
        { 
            _id: partId, 
            quantityOnHand: { $gte: qty }
        },
        { $inc: { quantityOnHand: -qty } },
        { new: true, runValidators: true }
    );

    if (!updated) {
        throw new Error("Insufficient stock on hand to complete installation.", { cause: 400 });
    }

    return updated;
};

/**
 * Restock parts (add to onHand).
 * @param {string} partId
 * @param {number} qty
 */
exports.restockPart = async (partId, qty) => {
    return await InventoryPart.findByIdAndUpdate(
        partId,
        { $inc: { quantityOnHand: qty }, $set: { lastRestockedAt: new Date() } },
        { new: true }
    );
};

/**
 * Get low-stock parts for a branch.
 */
exports.getLowStockParts = async (branchId) => {
    try {
        return await InventoryPart.find({
            branchId,
            isActive: true,
            $expr: { $lte: ["$quantityOnHand", "$reorderLevel"] },
        })
            .populate("supplierId", "name")
            .sort({ quantityOnHand: 1 });
    } catch (error) {
        throw error;
    }
};

/**
 * Return parts to stock (physical return after installation or similar).
 * @param {string} partId
 * @param {number} qty
 */
exports.returnToStock = async (partId, qty) => {
    return await InventoryPart.findByIdAndUpdate(
        partId,
        { $inc: { quantityOnHand: qty } },
        { new: true }
    );
};
