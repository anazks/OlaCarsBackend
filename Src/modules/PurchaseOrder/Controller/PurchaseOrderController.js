const {
    addPurchaseOrderService,
    getPurchaseOrdersService,
    getPurchaseOrderByIdService,
    updatePurchaseOrderStatusService,
    updatePurchaseOrderService,
} = require("../Repo/PurchaseOrderRepo.js");
const { ROLES } = require("../../../shared/constants/roles.js");
const Branch = require("../../Branch/Model/BranchModel.js");

// ─── Role Hierarchy Levels ────────────────────────────────────────────
const ROLE_LEVEL = {
    [ROLES.OPERATIONSTAFF]: 1,
    [ROLES.FINANCESTAFF]: 1,
    [ROLES.WORKSHOPSTAFF]: 1,
    [ROLES.BRANCHMANAGER]: 2,
    [ROLES.COUNTRYMANAGER]: 3,
    [ROLES.OPERATIONADMIN]: 4,
    [ROLES.FINANCEADMIN]: 4,
    [ROLES.ADMIN]: 5,
};

// Roles that are scoped to a branch (have branchId in JWT)
const BRANCH_SCOPED_ROLES = [ROLES.OPERATIONSTAFF, ROLES.FINANCESTAFF, ROLES.WORKSHOPSTAFF, ROLES.BRANCHMANAGER];
// Roles that are global (see everything)
const GLOBAL_ROLES = [ROLES.OPERATIONADMIN, ROLES.FINANCEADMIN, ROLES.ADMIN];

/**
 * Creates a new Purchase Order.
 * Any authenticated role can create a PO.
 * Branch-level staff: branch auto-assigned from JWT.
 * CountryManager+: must send branch in body.
 */
const addPurchaseOrder = async (req, res) => {
    try {
        let poData = req.body;

        // Branch assignment
        if (BRANCH_SCOPED_ROLES.includes(req.user.role)) {
            if (!req.user.branchId) {
                return res.status(400).json({ success: false, message: "Your account has no branch assigned. Contact admin." });
            }
            poData.branch = req.user.branchId;
        } else {
            if (!poData.branch) {
                return res.status(400).json({ success: false, message: "Branch ID is required. You must specify which branch this PO is for." });
            }
        }

        // Auto-generate PO number
        const randomString = Math.random().toString(36).substring(2, 6).toUpperCase();
        poData.purchaseOrderNumber = `PO-${Date.now()}-${randomString}`;

        // Auto-calculate total
        let calculatedTotal = 0;
        if (poData.items && Array.isArray(poData.items)) {
            poData.items.forEach(item => {
                calculatedTotal += (item.quantity || 1) * (item.unitPrice || 0);
            });
        }
        poData.totalAmount = calculatedTotal;

        poData.createdBy = req.user.id;
        poData.creatorRole = req.user.role;

        const newPO = await addPurchaseOrderService(poData);
        return res.status(201).json({ success: true, data: newPO });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Gets Purchase Orders — scoped by role:
 *  Staff (L1)       → own POs only
 *  BranchManager    → all POs from their branch
 *  CountryManager   → all POs from branches in their country
 *  Semi-Admin/Admin → all POs
 */
const getPurchaseOrders = async (req, res) => {
    try {
        const { role } = req.user;
        const { purpose } = req.query; // Extract purpose from query string
        let query = {};

        // Filter by purpose if provided
        if (purpose) {
            query.purpose = purpose;
            if (purpose === "Vehicle") {
                query.status = "APPROVED"; // Vehicle onboarding only uses approved POs
            }
        }

        if (role === ROLES.BRANCHMANAGER) {
            // BM sees all POs from their branch
            query.branch = req.user.branchId;
        } else if ([ROLES.OPERATIONSTAFF, ROLES.FINANCESTAFF, ROLES.WORKSHOPSTAFF].includes(role)) {
            // Staff sees only their own POs
            query.createdBy = req.user.id;
        } else if (role === ROLES.COUNTRYMANAGER) {
            // CM sees POs from all branches in their country AND POs they created themselves
            const branches = await Branch.find({ country: req.user.country, isDeleted: false }).select("_id");
            const branchIds = branches.map(b => b._id);

            // Override the root query with an $or condition for CMs
            query.$or = [
                { branch: { $in: branchIds } },
                { createdBy: req.user.id }
            ];
        }
        // Admin, OperationAdmin, FinanceAdmin → no filter (see all)

        const pos = await getPurchaseOrdersService(query);
        return res.status(200).json({ success: true, data: pos });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Gets a Purchase Order by ID.
 */
const getPurchaseOrderById = async (req, res) => {
    try {
        const po = await getPurchaseOrderByIdService(req.params.id);
        if (!po) {
            return res.status(404).json({ success: false, message: "Purchase Order not found" });
        }
        return res.status(200).json({ success: true, data: po });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Approves or Rejects a Purchase Order.
 *
 * Rules:
 *  1. Approver's role level must be ABOVE the creator's role level
 *  2. BranchManager can only approve POs from their own branch
 *  3. CountryManager can only approve POs from branches in their country
 *  4. Semi-Admin/Admin can approve any PO
 *  5. POs over $1000 → Admin only
 *  6. Cannot self-approve
 */
const approvePurchaseOrder = async (req, res) => {
    try {
        const poId = req.params.id;
        const { status } = req.body;
        const approverRole = req.user.role;
        const approverId = req.user.id;

        // Validate status
        if (!["APPROVED", "REJECTED"].includes(status)) {
            return res.status(400).json({ success: false, message: "Invalid status. Must be APPROVED or REJECTED." });
        }

        const currentPO = await getPurchaseOrderByIdService(poId);
        if (!currentPO) {
            return res.status(404).json({ success: false, message: "Purchase Order not found." });
        }

        if (currentPO.status !== "WAITING") {
            return res.status(400).json({ success: false, message: "Purchase order is already processed." });
        }

        // Rule 6: No self-approval
        if (currentPO.createdBy._id.toString() === approverId) {
            return res.status(403).json({ success: false, message: "You cannot approve your own Purchase Order." });
        }

        // Rule 1: Hierarchical check — approver level must be > creator level
        const creatorLevel = ROLE_LEVEL[currentPO.creatorRole] || 0;
        const approverLevel = ROLE_LEVEL[approverRole] || 0;

        if (approverLevel <= creatorLevel) {
            return res.status(403).json({
                success: false,
                message: `Role "${approverRole}" (Level ${approverLevel}) cannot approve POs created by "${currentPO.creatorRole}" (Level ${creatorLevel}). Approver must be a higher level.`,
            });
        }

        // Rule 5: Over $1000 → Admin only
        if (currentPO.totalAmount > 1000 && approverRole !== ROLES.ADMIN) {
            return res.status(403).json({
                success: false,
                message: `Purchase Orders over $1000 can only be approved by ADMIN. This PO total: $${currentPO.totalAmount}.`,
            });
        }

        // Rules 2 & 3: Branch / Country scoping
        const poBranchId = currentPO.branch._id ? currentPO.branch._id.toString() : currentPO.branch.toString();

        if (approverRole === ROLES.BRANCHMANAGER) {
            // Rule 2: BM can only approve POs from their branch
            if (req.user.branchId.toString() !== poBranchId) {
                return res.status(403).json({
                    success: false,
                    message: "You can only approve Purchase Orders from your own branch.",
                });
            }
        } else if (approverRole === ROLES.COUNTRYMANAGER) {
            // Rule 3: CM can only approve POs from branches in their country
            const poBranch = await Branch.findById(poBranchId).select("country");
            if (!poBranch || poBranch.country !== req.user.country) {
                return res.status(403).json({
                    success: false,
                    message: "You can only approve Purchase Orders from branches in your country.",
                });
            }
        }
        // Admin, OperationAdmin, FinanceAdmin → no scoping restriction

        // All checks passed — update status
        const updatedPO = await updatePurchaseOrderStatusService(poId, status, approverId, approverRole);
        return res.status(200).json({ success: true, data: updatedPO });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Edits a Purchase Order.
 * Only the original creator (or Admin) can edit. Resets status to WAITING.
 */
const editPurchaseOrder = async (req, res) => {
    try {
        const poId = req.params.id;
        const updateData = req.body;
        const editorId = req.user.id;
        const editorRole = req.user.role;

        const currentPO = await getPurchaseOrderByIdService(poId);
        if (!currentPO) {
            return res.status(404).json({ success: false, message: "Purchase Order not found" });
        }

        // Only creator or Admin can edit
        if (currentPO.createdBy._id.toString() !== editorId && editorRole !== ROLES.ADMIN) {
            return res.status(403).json({ success: false, message: "You don't have permission to edit this Purchase Order." });
        }

        // Generate change summary
        let changesSummary = [];

        if (updateData.items) {
            const oldItems = currentPO.items;
            const newItems = updateData.items;
            const oldItemNames = oldItems.map(i => i.itemName).sort().join(", ");
            const newItemNames = newItems.map(i => i.itemName).sort().join(", ");

            if (oldItemNames !== newItemNames) {
                const oldSet = new Set(oldItems.map(i => i.itemName));
                const newSet = new Set(newItems.map(i => i.itemName));
                const added = [...newSet].filter(x => !oldSet.has(x));
                const removed = [...oldSet].filter(x => !newSet.has(x));
                if (added.length) changesSummary.push(`Added items: ${added.join(", ")}`);
                if (removed.length) changesSummary.push(`Removed items: ${removed.join(", ")}`);
            } else {
                changesSummary.push(`Updated quantities or prices in items list.`);
            }

            // Recalculate total
            let calculatedTotal = 0;
            updateData.items.forEach(item => {
                calculatedTotal += (item.quantity || 1) * (item.unitPrice || 0);
            });
            updateData.totalAmount = calculatedTotal;
        }

        if (updateData.supplier && updateData.supplier !== currentPO.supplier._id.toString()) {
            changesSummary.push(`Changed supplier.`);
        }

        if (updateData.purpose && updateData.purpose !== currentPO.purpose) {
            changesSummary.push(`Changed purpose to ${updateData.purpose}.`);
        }

        if (changesSummary.length === 0) {
            changesSummary.push(`Made minor field updates.`);
        }

        const historyRecord = {
            editedAt: new Date(),
            editedBy: editorId,
            editorRole: editorRole,
            previousStatus: currentPO.status,
            changesSummary: changesSummary.join(" | "),
        };

        const finalUpdate = {
            $set: {
                ...updateData,
                isEdited: true,
                status: "WAITING",
            },
            $push: {
                editHistory: historyRecord,
            },
        };

        const updatedPO = await updatePurchaseOrderService(poId, finalUpdate);
        return res.status(200).json({ success: true, data: updatedPO });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = {
    addPurchaseOrder,
    getPurchaseOrders,
    getPurchaseOrderById,
    approvePurchaseOrder,
    editPurchaseOrder,
};
