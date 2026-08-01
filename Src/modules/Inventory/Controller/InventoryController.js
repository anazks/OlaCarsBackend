const {
    createPart,
    getParts,
    getPartById,
    updatePart,
    deletePart,
    getLowStockParts,
} = require("../Repo/InventoryPartRepo");
const { 
    checkAndReserve, 
    releaseReservation, 
    confirmInstallation, 
    receiveStock 
} = require("../Service/InventoryService");
const { getWorkshopPartRequirements } = require("../../WorkOrder/Repo/WorkOrderRepo");
const { PartTransaction } = require("../Model/PartTransactionModel");

/**
 * Create a new inventory part.
 * @route POST /api/inventory
 */
const createPartHandler = async (req, res) => {
    try {
        const data = req.body;
        data.createdBy = req.user.id;
        data.creatorRole = req.user.role;

        const part = await createPart(data);
        return res.status(201).json({ success: true, data: part });
    } catch (error) {
        const statusCode = error.cause || 500;
        return res.status(statusCode).json({ success: false, message: error.message });
    }
};

/**
 * Bulk create or update inventory parts.
 * @route POST /api/inventory/bulk
 */
const bulkCreatePartsHandler = async (req, res) => {
    try {
        const { parts, branch: selectedBranch } = req.body;
        if (!Array.isArray(parts) || parts.length === 0) {
            return res.status(400).json({ success: false, message: "A valid array of parts is required." });
        }

        const userRole = req.user.role;
        const userId = req.user.id || req.user._id;
        const userBranchId = req.user.branchId;

        // Determine branch mapping scope
        const branchRoles = ["BRANCHMANAGER", "OPERATIONSTAFF", "FINANCESTAFF", "WORKSHOPSTAFF", "WORKSHOPMANAGER"];
        const isAutoAssign = branchRoles.includes(userRole);
        let branchId = isAutoAssign ? userBranchId : selectedBranch;

        const results = await require("../Repo/InventoryPartRepo").bulkExcelUploadParts(
            parts,
            userId,
            userRole,
            branchId
        );

        let statusCode = 201;
        if (results.errors.length > 0) {
            statusCode = results.created.length > 0 ? 207 : 400;
        }

        return res.status(statusCode).json({
            success: results.created.length > 0,
            message: `${results.created.length} part(s) synced, ${results.errors.length} error(s).`,
            data: results
        });
    } catch (error) {
        const statusCode = error.cause || 500;
        return res.status(statusCode).json({ success: false, message: error.message });
    }
};

/**
 * Get all inventory parts with filters.
 * @route GET /api/inventory
 */
const getPartsHandler = async (req, res) => {
    try {
        const parts = await getParts(req.query);
        return res.status(200).json({ success: true, data: parts });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Get a single part by ID.
 * @route GET /api/inventory/:id
 */
const getPartByIdHandler = async (req, res) => {
    try {
        const part = await getPartById(req.params.id);
        if (!part) return res.status(404).json({ success: false, message: "Part not found" });
        return res.status(200).json({ success: true, data: part });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Update a part.
 * @route PUT /api/inventory/:id
 */
const updatePartHandler = async (req, res) => {
    try {
        const part = await updatePart(req.params.id, req.body);
        if (!part) return res.status(404).json({ success: false, message: "Part not found" });
        return res.status(200).json({ success: true, data: part });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Soft-delete a part.
 * @route DELETE /api/inventory/:id
 */
const deletePartHandler = async (req, res) => {
    try {
        const part = await deletePart(req.params.id);
        if (!part) return res.status(404).json({ success: false, message: "Part not found" });
        return res.status(200).json({ success: true, message: "Part deactivated", data: part });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Restock a part (add quantity).
 * @route PUT /api/inventory/:id/restock
 */
const restockPartHandler = async (req, res) => {
    try {
        const { quantity } = req.body;
        if (!quantity || quantity <= 0) {
            return res.status(400).json({ success: false, message: "Quantity must be greater than 0" });
        }
        const part = await receiveStock(req.params.id, quantity, req.user);
        if (!part) return res.status(404).json({ success: false, message: "Part not found" });
        return res.status(200).json({ success: true, data: part });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Reserve stock for a work order.
 * @route PUT /api/inventory/:id/reserve
 */
const reserveStockHandler = async (req, res) => {
    try {
        const { quantity, workOrderId } = req.body;
        if (!quantity || quantity <= 0) {
            return res.status(400).json({ success: false, message: "Quantity must be greater than 0" });
        }
        const result = await checkAndReserve(req.params.id, quantity, req.user, workOrderId);
        if (!result.success) {
            return res.status(400).json({ success: false, message: result.message, shortfall: result.shortfall });
        }
        return res.status(200).json({ success: true, data: result.part });
    } catch (error) {
        const statusCode = error.cause || 500;
        return res.status(statusCode).json({ success: false, message: error.message });
    }
};

/**
 * Release reserved stock.
 * @route PUT /api/inventory/:id/release
 */
const releaseStockHandler = async (req, res) => {
    try {
        const { quantity, workOrderId } = req.body;
        const part = await releaseReservation(req.params.id, quantity, req.user, workOrderId);
        return res.status(200).json({ success: true, data: part });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Confirm part installation (deducts stock).
 * @route PUT /api/inventory/:id/install
 */
const installPartHandler = async (req, res) => {
    try {
        const { quantity, workOrderId } = req.body;
        const part = await confirmInstallation(req.params.id, quantity, req.user, workOrderId);
        return res.status(200).json({ success: true, data: part });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Get low-stock parts for a branch.
 * @route GET /api/inventory/low-stock/:branchId
 */
const getLowStockHandler = async (req, res) => {
    try {
        const parts = await getLowStockParts(req.params.branchId);
        return res.status(200).json({ success: true, data: parts });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Get transaction history for a specific part.
 * @route GET /api/inventory/:id/transactions
 */
const getPartTransactionsHandler = async (req, res) => {
    try {
        const { id } = req.params;
        const transactions = await PartTransaction.find({ partId: id })
            .populate("performedBy", "name")
            .populate("workOrderId", "workOrderNumber")
            .sort({ createdAt: -1 });
        
        return res.status(200).json({ success: true, data: transactions });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Get all pending part requirements for a branch.
 * @route GET /api/inventory/workshop-requirements/:branchId
 */
const getWorkshopRequirementsHandler = async (req, res) => {
    try {
        const { branchId } = req.params;
        const requirements = await getWorkshopPartRequirements(branchId);
        return res.status(200).json({ success: true, data: requirements });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Block or unblock a material code.
 * @route PATCH /api/inventory/:id/block
 */
const blockMaterialCodeHandler = async (req, res) => {
    try {
        const { isBlocked, blockedReason } = req.body;
        const part = await updatePart(req.params.id, {
            isBlocked: !!isBlocked,
            blockedReason: blockedReason || (isBlocked ? "Blocked by admin" : "")
        });
        if (!part) return res.status(404).json({ success: false, message: "Part not found" });
        return res.status(200).json({
            success: true,
            data: part,
            message: `Material code ${part.partNumber} is now ${isBlocked ? 'BLOCKED' : 'UNBLOCKED'}.`
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Set blocked quantity for an inventory part.
 * @route PATCH /api/inventory/:id/block-quantity
 */
const blockQuantityHandler = async (req, res) => {
    try {
        const { quantityBlocked, blockedReason } = req.body;
        const qty = Math.max(0, Number(quantityBlocked) || 0);
        const part = await updatePart(req.params.id, {
            quantityBlocked: qty,
            blockedReason: blockedReason || (qty > 0 ? `Blocked ${qty} unit(s)` : "")
        });
        if (!part) return res.status(404).json({ success: false, message: "Part not found" });
        return res.status(200).json({
            success: true,
            data: part,
            message: `Blocked quantity updated to ${qty} unit(s).`
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Get stock overview for multiple item codes.
 * @route POST /api/inventory/multi-stock-overview
 */
const getMultiStockOverviewHandler = async (req, res) => {
    try {
        const { codes, branchId } = req.body;
        const { InventoryPart } = require("../Model/InventoryPartModel");

        let codeList = [];
        if (Array.isArray(codes)) {
            codeList = codes.map(c => String(c).trim()).filter(Boolean);
        } else if (typeof codes === "string") {
            codeList = codes.split(/[\n,;\s]+/).map(c => c.trim()).filter(Boolean);
        }

        const query = { isActive: { $ne: false } };
        if (branchId) query.branchId = branchId;

        if (codeList.length > 0) {
            const regexes = codeList.map(c => new RegExp(`^${c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'));
            const partialRegexes = codeList.map(c => new RegExp(c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
            query.$or = [
                { partNumber: { $in: regexes } },
                { partNumber: { $in: partialRegexes } },
                { partName: { $in: partialRegexes } }
            ];
        }

        const parts = await InventoryPart.find(query).populate("branchId", "name").lean({ virtuals: true });

        const mappedParts = parts.map(p => {
            const blocked = p.isBlocked ? p.quantityOnHand : (p.quantityBlocked || 0);
            const available = p.isBlocked ? 0 : Math.max(0, p.quantityOnHand - (p.quantityReserved || 0) - (p.quantityBlocked || 0));
            return {
                ...p,
                quantityAvailable: available,
                effectiveBlocked: blocked,
                statusText: p.isBlocked ? "BLOCKED (Material Code)" : (p.quantityBlocked > 0 ? `PARTIALLY BLOCKED (${p.quantityBlocked})` : (available <= 0 ? "OUT OF STOCK" : (p.quantityOnHand <= p.reorderLevel ? "LOW STOCK" : "AVAILABLE")))
            };
        });

        return res.status(200).json({
            success: true,
            totalFound: mappedParts.length,
            requestedCodes: codeList,
            data: mappedParts
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Get spare parts consumption report.
 * @route GET /api/inventory/reports/consumption
 */
const getConsumptionReportHandler = async (req, res) => {
    try {
        const { period = "monthly", startDate, endDate, itemCodes, branchId } = req.query;
        const { PartTransaction } = require("../Model/PartTransactionModel");
        const { InventoryPart } = require("../Model/InventoryPartModel");

        let endD = endDate ? new Date(endDate) : new Date();
        endD.setHours(23, 59, 59, 999);

        let startD = startDate ? new Date(startDate) : new Date();
        if (!startDate) {
            startD = new Date(endD);
            if (period === "daily") {
                startD.setHours(0, 0, 0, 0);
            } else if (period === "weekly") {
                startD.setDate(startD.getDate() - 7);
                startD.setHours(0, 0, 0, 0);
            } else if (period === "monthly") {
                startD.setDate(startD.getDate() - 30);
                startD.setHours(0, 0, 0, 0);
            } else if (period === "half-yearly") {
                startD.setDate(startD.getDate() - 180);
                startD.setHours(0, 0, 0, 0);
            } else if (period === "yearly") {
                startD.setDate(startD.getDate() - 365);
                startD.setHours(0, 0, 0, 0);
            } else {
                startD.setDate(startD.getDate() - 30);
                startD.setHours(0, 0, 0, 0);
            }
        } else {
            startD.setHours(0, 0, 0, 0);
        }

        const txQuery = {
            transactionType: "INSTALL",
            createdAt: { $gte: startD, $lte: endD }
        };
        if (branchId) txQuery.branchId = branchId;

        if (itemCodes && String(itemCodes).trim()) {
            const rawCodes = String(itemCodes).split(/[\n,;\s]+/).map(c => c.trim()).filter(Boolean);
            if (rawCodes.length > 0) {
                const regexes = rawCodes.map(c => new RegExp(c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
                const matchedParts = await InventoryPart.find({
                    $or: [
                        { partNumber: { $in: regexes } },
                        { partName: { $in: regexes } }
                    ]
                }).select("_id").lean();
                const targetPartIds = matchedParts.map(p => p._id);
                txQuery.partId = { $in: targetPartIds };
            }
        }

        const transactions = await PartTransaction.find(txQuery)
            .populate("partId")
            .populate("performedBy", "personalInfo fullName email name")
            .populate("workOrderId", "workOrderNumber vehicleId")
            .sort({ createdAt: -1 })
            .lean();

        const partMap = {};
        let totalQuantityConsumed = 0;
        let totalConsumptionCost = 0;

        for (const tx of transactions) {
            const part = tx.partId;
            if (!part) continue;

            const qty = Math.abs(tx.quantity);
            const unitCost = part.unitCost || 0;
            const cost = qty * unitCost;

            totalQuantityConsumed += qty;
            totalConsumptionCost += cost;

            const partIdStr = String(part._id);
            if (!partMap[partIdStr]) {
                partMap[partIdStr] = {
                    partId: part._id,
                    partName: part.partName,
                    partNumber: part.partNumber,
                    category: part.category,
                    unit: part.unit,
                    unitCost: unitCost,
                    totalQuantity: 0,
                    totalCost: 0,
                    transactions: []
                };
            }

            partMap[partIdStr].totalQuantity += qty;
            partMap[partIdStr].totalCost += cost;
            partMap[partIdStr].transactions.push({
                transactionId: tx._id,
                date: tx.createdAt,
                quantity: qty,
                cost: cost,
                workOrderNumber: tx.workOrderId?.workOrderNumber || "N/A",
                performedBy: tx.performedBy?.personalInfo?.fullName || tx.performedBy?.name || "Technician",
                notes: tx.notes || ""
            });
        }

        const aggregatedItems = Object.values(partMap).sort((a, b) => b.totalQuantity - a.totalQuantity);

        return res.status(200).json({
            success: true,
            period,
            startDate: startD,
            endDate: endD,
            summary: {
                totalPartsCount: aggregatedItems.length,
                totalQuantityConsumed,
                totalConsumptionCost
            },
            data: aggregatedItems,
            rawTransactionsCount: transactions.length
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = {
    createPartHandler,
    bulkCreatePartsHandler,
    getPartsHandler,
    getPartByIdHandler,
    updatePartHandler,
    deletePartHandler,
    restockPartHandler,
    reserveStockHandler,
    releaseStockHandler,
    installPartHandler,
    getLowStockHandler,
    getPartTransactionsHandler,
    getWorkshopRequirementsHandler,
    blockMaterialCodeHandler,
    blockQuantityHandler,
    getMultiStockOverviewHandler,
    getConsumptionReportHandler,
};
