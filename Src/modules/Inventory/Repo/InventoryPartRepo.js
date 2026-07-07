const { InventoryPart } = require("../Model/InventoryPartModel");
const AccountingCode = require("../../AccountingCode/Model/AccountingCodeModel");
const Tax = require("../../Tax/Model/TaxModel");

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
        if (!data.purchaseAccountId) {
            const purchaseAcc = await AccountingCode.findOne({ code: "CGS0001" });
            if (purchaseAcc) data.purchaseAccountId = purchaseAcc._id;
        }
        if (!data.incomeAccountId) {
            const incomeAcc = await AccountingCode.findOne({ code: "IN0008" });
            if (incomeAcc) data.incomeAccountId = incomeAcc._id;
        }
        if (!data.inventoryAccountId) {
            const invAcc = await AccountingCode.findOne({ code: "AST0001" });
            if (invAcc) data.inventoryAccountId = invAcc._id;
        }
        if (!data.taxId) {
            const defaultTax = await Tax.findOne({ name: "ITBMS" });
            if (defaultTax) data.taxId = defaultTax._id;
        }
        const part = await InventoryPart.create(data);
        return part.toObject();
    } catch (error) {
        if (error.code === 11000 && error.keyPattern && error.keyPattern.partNumber) {
            throw new Error("A part with this part number already exists.", { cause: 409 });
        }
        throw error;
    }
};

exports.bulkCreateParts = async (partsData) => {
    try {
        const purchaseAcc = await AccountingCode.findOne({ code: "CGS0001" });
        const incomeAcc = await AccountingCode.findOne({ code: "IN0008" });
        const invAcc = await AccountingCode.findOne({ code: "AST0001" });
        const defaultTax = await Tax.findOne({ name: "ITBMS" });

        const enriched = partsData.map(part => {
            const copy = { ...part };
            if (!copy.purchaseAccountId && purchaseAcc) {
                copy.purchaseAccountId = purchaseAcc._id;
            }
            if (!copy.incomeAccountId && incomeAcc) {
                copy.incomeAccountId = incomeAcc._id;
            }
            if (!copy.inventoryAccountId && invAcc) {
                copy.inventoryAccountId = invAcc._id;
            }
            if (!copy.taxId && defaultTax) {
                copy.taxId = defaultTax._id;
            }
            return copy;
        });

        const result = await InventoryPart.insertMany(enriched, { ordered: false });
        return { successCount: result.length, parts: result };
    } catch (error) {
        // If ordered is false, mongoose throws a BulkWriteError that contains insertedDocs
        if (error.name === 'BulkWriteError' || error.code === 11000) {
            return {
                successCount: error.insertedDocs ? error.insertedDocs.length : 0,
                parts: error.insertedDocs || [],
                errorCount: error.writeErrors ? error.writeErrors.length : 1,
                message: "Some parts could not be inserted (likely duplicate part numbers)."
            };
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
            .populate("inventoryAccountId", "code name")
            .populate("purchaseAccountId", "code name")
            .populate("incomeAccountId", "code name")
            .populate("taxId", "name rate")
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
            .populate("supplierId", "name")
            .populate("inventoryAccountId", "code name")
            .populate("purchaseAccountId", "code name")
            .populate("incomeAccountId", "code name")
            .populate("taxId", "name rate");
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
        const query = {
            isActive: true,
            $expr: { $lte: ["$quantityOnHand", "$reorderLevel"] },
        };
        if (branchId) {
            query.branchId = branchId;
        }
        return await InventoryPart.find(query)
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

/**
 * Helper to pick fields case-insensitively from a row object.
 */
function pick(row, ...keys) {
    for (const k of keys) {
        if (row[k] !== undefined && row[k] !== null && String(row[k]).trim() !== '') {
            return String(row[k]).trim();
        }
    }
    return undefined;
}

function pickNum(row, ...keys) {
    const val = pick(row, ...keys);
    if (val === undefined) return undefined;

    // Clean string from letters, whitespace, and currency symbols
    let cleaned = String(val).replace(/[A-Za-z\$\€\£\¥\s]/g, '');

    // Standardize decimal and thousands separators
    if (cleaned.includes(',') && cleaned.includes('.')) {
        cleaned = cleaned.replace(/,/g, '');
    } else if (cleaned.includes(',')) {
        cleaned = cleaned.replace(/,/g, '.');
    }

    const n = Number(cleaned);
    return isNaN(n) ? undefined : n;
}

/**
 * Bulk create or update inventory parts from Excel/CSV parsed rows.
 */
exports.bulkExcelUploadParts = async (partsData, userId, userRole, defaultBranchId) => {
    const Branch = require("../../Branch/Model/BranchModel");
    const Supplier = require("../../Supplier/Model/SupplierModel");

    try {
        // Fetch active entities for fast lookup in memory
        const branches = await Branch.find({ isDeleted: false, status: "ACTIVE" });
        const suppliers = await Supplier.find({ isDeleted: false, isActive: true });
        const accounts = await AccountingCode.find({ isDeleted: false, isActive: true });
        const taxes = await Tax.find({ isDeleted: false, isActive: true });

        // Caching standard defaults
        const defaultPurchaseAcc = accounts.find(acc => acc.code === "CGS0001") ||
            accounts.find(acc => (acc.category || '').toUpperCase() === "COST OF GOODS SOLD" || (acc.category || '').toUpperCase() === "EXPENSE");
        const defaultIncomeAcc = accounts.find(acc => acc.code === "IN0008") ||
            accounts.find(acc => (acc.category || '').toUpperCase() === "INCOME") ||
            accounts.find(acc => (acc.name || '').toLowerCase().includes("income"));
        const defaultInvAcc = accounts.find(acc => acc.code === "INV0001") ||
            accounts.find(acc => acc.code === "AST0001") ||
            accounts.find(acc => (acc.name || '').toLowerCase().includes("inventory")) ||
            accounts.find(acc => (acc.category || '').toUpperCase() === "ASSET" || (acc.category || '').toUpperCase() === "EQUITY");
        const defaultTax = taxes.find(t => t.name === "ITBMS") || taxes[0];

        const results = { created: [], errors: [] };

        // Standardize unit values helper
        const mapUnit = (u) => {
            if (!u) return "piece";
            const val = String(u).trim().toLowerCase();
            if (["piece", "pcs", "pc", "units", "unit", "each"].includes(val)) return "piece";
            if (["litre", "litres", "l", "liter", "liters"].includes(val)) return "litre";
            if (["kg", "kilogram", "kilograms", "kilos", "kilo"].includes(val)) return "kg";
            if (["metre", "metres", "m", "meter", "meters"].includes(val)) return "metre";
            if (["set", "sets"].includes(val)) return "set";
            if (["pair", "pairs"].includes(val)) return "pair";
            if (["box", "boxes"].includes(val)) return "box";
            return "piece";
        };

        // Standardize category helper
        const mapCategory = (cat) => {
            if (!cat) return "Other";
            const clean = String(cat).trim();
            const { PART_CATEGORIES } = require("../Model/InventoryPartModel");
            const found = PART_CATEGORIES.find(c => c.toLowerCase() === clean.toLowerCase());
            if (found) return found;

            // Custom mapping logic
            if (clean.toLowerCase().includes("engine")) return "Engine";
            if (clean.toLowerCase().includes("brake")) return "Brakes";
            if (clean.toLowerCase().includes("suspension")) return "Suspension";
            if (clean.toLowerCase().includes("fluid")) return "Fluids";
            if (clean.toLowerCase().includes("filter")) return "Filters";
            if (clean.toLowerCase().includes("belt")) return "Belts";
            if (clean.toLowerCase().includes("cool")) return "Cooling";
            if (clean.toLowerCase().includes("exhaust")) return "Exhaust";
            if (clean.toLowerCase().includes("interior")) return "Interior";
            if (clean.toLowerCase().includes("tyre") || clean.toLowerCase().includes("tire")) return "Tyres";

            return "Other";
        };

        for (let i = 0; i < partsData.length; i++) {
            const row = partsData[i];
            const rowNum = i + 1;

            try {
                // 1. Resolve Part Name
                const partName = pick(row, 'Item Name', 'CF.Item Name', 'item name', 'partName', 'part name', 'ItemName', 'Name', 'name');
                if (!partName) {
                    results.errors.push({ row: rowNum, message: "Missing required field: Item Name" });
                    continue;
                }

                // 2. Resolve Part Number (SKU/Item ID)
                let partNumber = pick(row, 'SKU', 'Item ID', 'partNumber', 'part number', 'sku', 'Part Number');
                if (!partNumber) {
                    results.errors.push({ row: rowNum, message: "Missing required field: SKU or Item ID" });
                    continue;
                }
                partNumber = partNumber.toUpperCase();

                // 3. Resolve Category
                const category = "Parts";

                // 4. Resolve Rate (selling price)
                const rateVal = pickNum(row, 'Rate', 'rate', 'selling price', 'Selling Price', 'Selling Rate', 'selling rate', 'unitCost');
                if (rateVal === undefined) {
                    results.errors.push({ row: rowNum, message: "Missing or invalid selling Rate (must be a number)" });
                    continue;
                }

                // 5. Resolve Stock
                const quantityOnHand = pickNum(row, 'Stock On Hand', 'Opening Stock', 'StockOnHand', 'OpeningStock', 'quantityOnHand', 'Stock on Hand', 'stock on hand') || 0;
                const reorderLevel = pickNum(row, 'Reorder Point', 'ReorderPoint', 'reorderLevel', 'reorder level', 'Reorder Level', 'reorder level') || 5;
                const unitVal = pick(row, 'Usage unit', 'Unit Name', 'UnitName', 'unit', 'Unit', 'Usage Unit', 'usage unit');
                const unit = mapUnit(unitVal);

                // 6. Resolve Branch
                let branchId = defaultBranchId;
                const branchVal = pick(row, 'Location Name', 'LocationName', 'branch', 'Branch', 'location');
                if (branchVal) {
                    const cleanBranch = branchVal.toLowerCase();
                    const matchedBranch = branches.find(b =>
                        b.name.toLowerCase() === cleanBranch ||
                        b.code.toLowerCase() === cleanBranch
                    );
                    if (matchedBranch) {
                        branchId = matchedBranch._id;
                    } else if (!branchId) {
                        results.errors.push({ row: rowNum, message: `Branch/Location "${branchVal}" not found.` });
                        continue;
                    }
                }
                if (!branchId) {
                    results.errors.push({ row: rowNum, message: "No branch / location specified or assigned to your user account." });
                    continue;
                }

                // 7. Resolve Supplier (Vendor)
                let supplierId = undefined;
                const supplierVal = pick(row, 'Vendor', 'vendor', 'Supplier', 'supplier', 'Vendor Number', 'vendorNumber');
                if (supplierVal) {
                    const cleanSup = supplierVal.toLowerCase();
                    const matchedSup = suppliers.find(s =>
                        s.name.toLowerCase() === cleanSup ||
                        (s.vendorNumber && s.vendorNumber.toLowerCase() === cleanSup)
                    );
                    if (matchedSup) {
                        supplierId = matchedSup._id;
                    }
                }

                // 8. Resolve Accounting Codes (Income, Purchase, Inventory)
                // - Income Account (for sales Rate)
                let incomeAccountId = undefined;
                const incomeAccVal = pick(row, 'Account Code', 'AccountCode', 'Account', 'account');
                if (incomeAccVal) {
                    const cleanCode = incomeAccVal.toLowerCase();
                    const matchedAcc = accounts.find(acc =>
                        acc.code.toLowerCase() === cleanCode ||
                        acc.name.toLowerCase() === cleanCode
                    );
                    if (matchedAcc) {
                        incomeAccountId = matchedAcc._id;
                    }
                }
                if (!incomeAccountId && defaultIncomeAcc) {
                    incomeAccountId = defaultIncomeAcc._id;
                }

                // - Purchase Account (for cost of goods sold)
                let purchaseAccountId = undefined;
                const purchaseAccVal = pick(row, 'Purchase Account Code', 'PurchaseAccountCode', 'Purchase Account', 'purchaseAccount');
                if (purchaseAccVal) {
                    const cleanCode = purchaseAccVal.toLowerCase();
                    const matchedAcc = accounts.find(acc =>
                        acc.code.toLowerCase() === cleanCode ||
                        acc.name.toLowerCase() === cleanCode
                    );
                    if (matchedAcc) {
                        purchaseAccountId = matchedAcc._id;
                    }
                }
                if (!purchaseAccountId && defaultPurchaseAcc) {
                    purchaseAccountId = defaultPurchaseAcc._id;
                }

                // - Inventory Account (for asset asset value)
                let inventoryAccountId = undefined;
                const inventoryAccVal = pick(row, 'Inventory Account Code', 'InventoryAccountCode', 'Inventory Account', 'inventoryAccount');
                if (inventoryAccVal) {
                    const cleanCode = inventoryAccVal.toLowerCase();
                    const matchedAcc = accounts.find(acc =>
                        acc.code.toLowerCase() === cleanCode ||
                        acc.name.toLowerCase() === cleanCode
                    );
                    if (matchedAcc) {
                        inventoryAccountId = matchedAcc._id;
                    }
                }
                if (!inventoryAccountId && defaultInvAcc) {
                    inventoryAccountId = defaultInvAcc._id;
                }

                if (!incomeAccountId || !purchaseAccountId || !inventoryAccountId) {
                    results.errors.push({ row: rowNum, message: "Could not resolve accounting codes and no system defaults were available." });
                    continue;
                }

                // 9. Resolve Tax
                let taxId = undefined;
                const taxNameVal = pick(row, 'Tax Name', 'TaxName', 'tax name');
                const taxPctVal = pickNum(row, 'Tax Percentage', 'TaxPercentage', 'tax percentage');
                if (taxNameVal || taxPctVal !== undefined) {
                    const matchedTax = taxes.find(t =>
                        (taxNameVal && t.name.toLowerCase() === taxNameVal.toLowerCase()) ||
                        (taxPctVal !== undefined && t.rate === taxPctVal)
                    );
                    if (matchedTax) {
                        taxId = matchedTax._id;
                    }
                }
                if (!taxId && defaultTax) {
                    taxId = defaultTax._id;
                }

                const description = pick(row, 'Description', 'description', 'Purchase Description', 'PurchaseDescription');

                // 10. Upsert database record
                const partData = {
                    partName,
                    partNumber,
                    category,
                    description,
                    unit,
                    unitCost: rateVal,
                    quantityOnHand,
                    reorderLevel,
                    branchId,
                    supplierId,
                    incomeAccountId,
                    purchaseAccountId,
                    inventoryAccountId,
                    taxId,
                    createdBy: userId,
                    creatorRole: userRole
                };

                const existingPart = await InventoryPart.findOne({
                    partName: { $regex: new RegExp("^" + partName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + "$", "i") },
                    isActive: true
                });
                if (existingPart) {
                    // Update existing part (upsert)
                    // Change its category to "Parts"
                    partData.category = "Parts";
                    Object.assign(existingPart, partData);
                    const updated = await existingPart.save();
                    results.created.push({
                        row: rowNum,
                        id: updated._id,
                        partNumber: updated.partNumber,
                        partName: updated.partName,
                        isUpdated: true
                    });
                } else {
                    // Create new part
                    // Ensure the partNumber is unique to avoid Mongo unique index constraint
                    let uniquePartNumber = partNumber;
                    const conflictingPart = await InventoryPart.findOne({ partNumber: uniquePartNumber, isActive: true });
                    if (conflictingPart) {
                        let suffix = 1;
                        while (await InventoryPart.findOne({ partNumber: `${uniquePartNumber}-${suffix}`, isActive: true })) {
                            suffix++;
                        }
                        uniquePartNumber = `${uniquePartNumber}-${suffix}`;
                    }
                    partData.partNumber = uniquePartNumber;

                    const created = await InventoryPart.create(partData);
                    results.created.push({
                        row: rowNum,
                        id: created._id,
                        partNumber: created.partNumber,
                        partName: created.partName,
                        isUpdated: false
                    });
                }

            } catch (err) {
                results.errors.push({ row: rowNum, message: err.message || "Unknown error during row process." });
            }
        }

        return results;

    } catch (error) {
        throw error;
    }
};

