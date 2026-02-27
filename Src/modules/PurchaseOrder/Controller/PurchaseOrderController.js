const {
    addPurchaseOrderService,
    getPurchaseOrdersService,
    getPurchaseOrderByIdService,
    updatePurchaseOrderStatusService,
    updatePurchaseOrderService,
} = require("../Repo/PurchaseOrderRepo.js");
const { ROLES } = require("../../../shared/constants/roles.js");

/**
 * Creates a new Purchase Order.
 * @route POST /api/purchase-order/
 * @access Private (BRANCHMANAGER, OPERATIONSTAFF, FINANCESTAFF)
 */
const addPurchaseOrder = async (req, res) => {
    try {
        let poData = req.body;

        // Auto-generate unique PO number
        const randomString = Math.random().toString(36).substring(2, 6).toUpperCase();
        poData.purchaseOrderNumber = `PO-${Date.now()}-${randomString}`;

        // Auto-calculate the totalAmount based on the items array
        let calculatedTotal = 0;
        if (poData.items && Array.isArray(poData.items)) {
            poData.items.forEach(item => {
                const qty = item.quantity || 1;
                const price = item.unitPrice || 0;
                calculatedTotal += (qty * price);
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
 * Gets all Purchase Orders.
 * @route GET /api/purchase-order/
 * @access Private
 */
const getPurchaseOrders = async (req, res) => {
    try {
        const userRole = req.user.role;
        let query = {};

        const limitedAuthorities = [
            ROLES.COUNTRYMANAGER,
            ROLES.OPERATIONADMIN,
            ROLES.FINANCEADMIN,
        ];

        const creators = [
            ROLES.BRANCHMANAGER,
            ROLES.OPERATIONSTAFF,
            ROLES.FINANCESTAFF,
        ];

        if (limitedAuthorities.includes(userRole)) {
            query.totalAmount = { $lte: 1000 };
        } else if (creators.includes(userRole)) {
            // Creators should only be able to see POs they created themselves (or from their branch if that's the intention, but here we restrict to createdBy)
            query.createdBy = req.user.id;
        }

        const pos = await getPurchaseOrdersService(query);
        return res.status(200).json({ success: true, data: pos });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Gets a Purchase Order by ID.
 * @route GET /api/purchase-order/:id
 * @access Private
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
 * @route PUT /api/purchase-order/:id/approve
 * @access Private
 */
const approvePurchaseOrder = async (req, res) => {
    try {
        const poId = req.params.id;
        const { status } = req.body; // 'APPROVED' or 'REJECTED'
        const approverRole = req.user.role;
        const approverId = req.user.id;

        if (!["APPROVED", "REJECTED"].includes(status)) {
            return res.status(400).json({ success: false, message: "Invalid status provided. Must be APPROVED or REJECTED." });
        }

        const currentPO = await getPurchaseOrderByIdService(poId);

        if (!currentPO) {
            return res.status(404).json({ success: false, message: "Purchase Order not found" });
        }

        if (currentPO.status !== "WAITING") {
            return res.status(400).json({ success: false, message: "Purchase order is already processed." });
        }

        // Business Logic for approval based on amount
        const amount = currentPO.totalAmount;

        if (amount > 1000) {
            if (approverRole !== ROLES.ADMIN) {
                return res.status(403).json({
                    success: false,
                    message: "Purchase Orders over 1000 can only be approved by ADMIN.",
                });
            }
        } else {
            const allowedApprovers = [
                ROLES.COUNTRYMANAGER,
                ROLES.OPERATIONADMIN,
                ROLES.FINANCEADMIN,
                ROLES.ADMIN,
            ];
            if (!allowedApprovers.includes(approverRole)) {
                return res.status(403).json({
                    success: false,
                    message: "You are not authorized to approve this Purchase Order.",
                });
            }
        }

        const updatedPO = await updatePurchaseOrderStatusService(
            poId,
            status,
            approverId,
            approverRole
        );

        return res.status(200).json({ success: true, data: updatedPO });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Edits a Purchase Order.
 * Can be edited by the creator. Resets status to WAITING and tracks changes.
 * @route PUT /api/purchase-order/:id
 * @access Private
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

        // Only the creator (or Admin) can edit
        if (currentPO.createdBy._id.toString() !== editorId && editorRole !== ROLES.ADMIN) {
            return res.status(403).json({ success: false, message: "You don't have permission to edit this Purchase Order." });
        }

        // Generate Human Readable Diff
        let changesSummary = [];

        // Track Item Changes
        if (updateData.items) {
            const oldItems = currentPO.items;
            const newItems = updateData.items;

            const oldItemNames = oldItems.map(i => i.itemName).sort().join(", ");
            const newItemNames = newItems.map(i => i.itemName).sort().join(", ");

            if (oldItemNames !== newItemNames) {
                // Determine added and removed items for precise summary
                const oldSet = new Set(oldItems.map(i => i.itemName));
                const newSet = new Set(newItems.map(i => i.itemName));
                const added = [...newSet].filter(x => !oldSet.has(x));
                const removed = [...oldSet].filter(x => !newSet.has(x));

                if (added.length) changesSummary.push(`Added items: ${added.join(", ")}`);
                if (removed.length) changesSummary.push(`Removed items: ${removed.join(", ")}`);
            } else {
                // Names matched, maybe quantity/price changed
                changesSummary.push(`Updated quantities or prices in items list.`);
            }

            // Recalculate Total
            let calculatedTotal = 0;
            updateData.items.forEach(item => {
                const qty = item.quantity || 1;
                const price = item.unitPrice || 0;
                calculatedTotal += (qty * price);
            });
            updateData.totalAmount = calculatedTotal;
        }

        if (updateData.supplier && updateData.supplier !== currentPO.supplier._id.toString()) {
            changesSummary.push(`Changed supplier.`);
        }

        if (changesSummary.length === 0) {
            changesSummary.push(`Made minor field updates.`);
        }

        // Build History Object
        const historyRecord = {
            editedAt: new Date(),
            editedBy: editorId,
            editorRole: editorRole,
            previousStatus: currentPO.status,
            changesSummary: changesSummary.join(" | "),
        };

        // Construct explicit Mongoose update object
        const finalUpdate = {
            $set: {
                ...updateData,
                isEdited: true,
                status: "WAITING"
            },
            $push: {
                editHistory: historyRecord
            }
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
