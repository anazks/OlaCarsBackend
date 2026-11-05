const {
    addPurchaseOrderService,
    getPurchaseOrdersService,
    getPurchaseOrderByIdService,
    updatePurchaseOrderStatusService,
    updatePurchaseOrderService,
} = require("../Repo/PurchaseOrderRepo.js");
const { ROLES } = require("../../../shared/constants/roles.js");
const Branch = require("../../Branch/Model/BranchModel.js");
const { getSetting } = require("../../SystemSettings/Repo/SystemSettingsRepo.js");
const uploadToS3 = require("../../../utils/uploadToS3");
const uploadLocal = require("../../../utils/uploadLocal");
const PurchaseOrderService = require("../Service/PurchaseOrderService.js");
const PurchaseOrder = require("../Model/PurchaseOrderModel.js");

// ─── Role Hierarchy Levels ────────────────────────────────────────────
const ROLE_LEVEL = {
    [ROLES.OPERATIONSTAFF]: 1,
    [ROLES.FINANCESTAFF]: 1,
    [ROLES.WORKSHOPSTAFF]: 1,
    [ROLES.BRANCHMANAGER]: 2,
    [ROLES.WORKSHOPMANAGER]: 2,
    [ROLES.COUNTRYMANAGER]: 3,
    [ROLES.OPERATIONADMIN]: 4,
    [ROLES.FINANCEADMIN]: 4,
    [ROLES.ADMIN]: 5,
};

// Roles that are scoped to a branch (have branchId in JWT)
const BRANCH_SCOPED_ROLES = [ROLES.OPERATIONSTAFF, ROLES.FINANCESTAFF, ROLES.WORKSHOPSTAFF, ROLES.BRANCHMANAGER, ROLES.WORKSHOPMANAGER];
// Roles that are global (see everything)
const GLOBAL_ROLES = [ROLES.OPERATIONADMIN, ROLES.FINANCEADMIN, ROLES.ADMIN];

/**
 * Creates a new Purchase Order.
 * Any authenticated role can create a PO.
 * Branch-level staff: branch auto-assigned from JWT.
 * CountryManager+: must send branch in body.
 * Expects `multipart/form-data` if images are included.
 * `items` should be a JSON string.
 */
const addPurchaseOrder = async (req, res) => {
    try {
        console.log("=========== PO INCOMING ===========");
        console.log("Headers:", req.headers['content-type']);
        console.log("INCOMING PO BODY (Keys):", Object.keys(req.body));
        console.log("INCOMING PO FILES (Count):", req.files ? req.files.length : 'undefined');
        console.log("===================================");

        let poData = req.body;

        // Safety check: if req.files is undefined, the frontend did NOT send multipart/form-data
        if (!req.files && req.headers['content-type']?.includes('application/json')) {
            console.log("WARNING: Received JSON. Images cannot be uploaded via JSON.");
        }

        // Parse items if they are sent as flat indexed keys (items[0][itemName], items[0][quantity])
        if (!poData.items || !Array.isArray(poData.items)) {
            const itemsMap = new Map();
            Object.keys(poData).forEach((key) => {
                const match = key.match(/^items\[(\d+)\]\[(.*?)\]$/);
                if (match) {
                    const index = match[1];
                    const field = match[2];
                    if (!itemsMap.has(index)) {
                        itemsMap.set(index, {});
                    }

                    let value = poData[key];
                    if (field === 'quantity' || field === 'unitPrice') {
                        value = Number(value);
                    }

                    itemsMap.get(index)[field] = value;
                    delete poData[key]; // Clean up flat keys from body
                }
            });

            if (itemsMap.size > 0) {
                // Convert Map values to array, sort by index to preserve order just in case
                poData.items = Array.from(itemsMap.values());
            } else if (typeof poData.items === "string") {
                try {
                    poData.items = JSON.parse(poData.items);
                } catch (err) {
                    return res.status(400).json({ success: false, message: "Invalid JSON format for items array." });
                }
            }
        }

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

        // Auto-calculate total and setup images
        let calculatedTotal = 0;
        if (poData.items && Array.isArray(poData.items)) {
            for (let i = 0; i < poData.items.length; i++) {
                const item = poData.items[i];
                // Ensure numeric types for calculation if they came as strings from FormData
                const qty = Number(item.quantity) || 0;
                const price = Number(item.unitPrice) || 0;
                calculatedTotal += qty * price;

                // Handle image uploads for this specific item if files exist
                // Since we use upload.any(), req.files is an ARRAY. 
                // We need to filter it for the specific fieldname: items[i][images]
                const fieldName = `items[${i}][images]`;
                const itemFiles = Array.isArray(req.files)
                    ? req.files.filter(f => f.fieldname === fieldName)
                    : [];

                if (itemFiles.length > 8) {
                    return res.status(400).json({ success: false, message: `Cannot upload more than 8 images for item: ${item.itemName || i}` });
                }

                const uploadedUrls = [];
                for (const file of itemFiles) {
                    const folder = `purchase-orders/temp-${poData.purchaseOrderNumber}/items/${i}`;
                    const uploadedUrl = await uploadToS3(file, folder);
                    uploadedUrls.push(uploadedUrl);
                }
                // Assign explicitly back to the original array reference
                poData.items[i].images = uploadedUrls;
            }
        }
        poData.totalAmount = calculatedTotal;

        poData.createdBy = req.user.id;
        poData.creatorRole = req.user.role;

        // ─── 1. PRE-VALIDATE LINKED PR ALLOCATION LIMITS ────────────────────────
        const WorkshopProcurement = require("../../WorkshopProcurement/Model/WorkshopProcurementModel.js");
        const prAllocationsMap = new Map();

        // Check item-level allocations and description fallback first
        if (Array.isArray(poData.items) && poData.items.length > 0) {
            poData.items.forEach(it => {
                if (Array.isArray(it.prAllocations) && it.prAllocations.length > 0) {
                    it.prAllocations.forEach(alloc => {
                        const key = alloc.prId ? String(alloc.prId) : (alloc.prNumber ? String(alloc.prNumber).trim() : null);
                        if (key) {
                            const existing = prAllocationsMap.get(key) || { alloc, totalQty: 0 };
                            existing.totalQty += (Number(alloc.allocatedQuantity) || Number(it.quantity) || 0);
                            prAllocationsMap.set(key, existing);
                        }
                    });
                } else if (it.description) {
                    // Fallback to description regex: Requisition #PR-OW-11-2026-00002
                    const match = it.description.match(/Requisition\s*#?\s*(PR-OW-[\w-]+)/i);
                    if (match && match[1]) {
                        const prNum = match[1].trim();
                        const existing = prAllocationsMap.get(prNum) || { alloc: { prNumber: prNum }, totalQty: 0 };
                        existing.totalQty += (Number(it.quantity) || 0);
                        prAllocationsMap.set(prNum, existing);
                    }
                }
            });
        }

        // Fallback to top-level linkedPRs if no item allocations detected
        if (prAllocationsMap.size === 0 && Array.isArray(poData.linkedPRs) && poData.linkedPRs.length > 0) {
            poData.linkedPRs.forEach(alloc => {
                const key = alloc.prId ? String(alloc.prId) : (alloc.prNumber ? String(alloc.prNumber).trim() : null);
                if (key) {
                    const existing = prAllocationsMap.get(key) || { alloc, totalQty: 0 };
                    existing.totalQty += (Number(alloc.allocatedQuantity) || 0);
                    prAllocationsMap.set(key, existing);
                }
            });
        }

        const prsToUpdate = [];
        for (const [key, { alloc, totalQty }] of prAllocationsMap.entries()) {
            const query = alloc.prId ? { _id: alloc.prId } : { requestNumber: alloc.prNumber };
            const pr = await WorkshopProcurement.findOne(query);
            if (!pr) {
                return res.status(404).json({
                    success: false,
                    message: `Purchase Requisition "${alloc.prNumber || alloc.prId}" not found.`
                });
            }

            // Only APPROVED / RELEASED / WAITING_QUOTATION / PARTIALLY_CONVERTED can be used
            const validStatuses = ["APPROVED", "RELEASED", "WAITING_QUOTATION", "PARTIALLY_CONVERTED"];
            if (!validStatuses.includes(pr.status)) {
                return res.status(400).json({
                    success: false,
                    message: `Requisition "${pr.requestNumber}" is in "${pr.status}" status. Only APPROVED or RELEASED requisitions can be converted into Purchase Orders.`
                });
            }

            const currentRemaining = pr.remainingQuantity !== undefined
                ? Number(pr.remainingQuantity)
                : (Number(pr.quantity) - (Number(pr.fulfilledQuantity) || 0));

            if (currentRemaining <= 0 || pr.status === "CONVERTED_TO_PO") {
                return res.status(400).json({
                    success: false,
                    message: `Requisition "${pr.requestNumber}" has already reached its total unit limit (${pr.fulfilledQuantity || pr.quantity}/${pr.quantity} units fulfilled). No further Purchase Orders can be created for this Requisition.`
                });
            }

            if (totalQty > currentRemaining) {
                return res.status(400).json({
                    success: false,
                    message: `Cannot allocate ${totalQty} units for Requisition "${pr.requestNumber}". Only ${currentRemaining} unit(s) remaining out of ${pr.quantity} total units.`
                });
            }

            prsToUpdate.push({ pr, allocQty: totalQty });
        }

        // Set status based on role
        if (req.user.role === ROLES.ADMIN) {
            poData.status = req.body.status || "APPROVED";
            poData.approvedBy = req.user.id;
            poData.approverRole = req.user.role;
        } else if (req.user.role === ROLES.MERCHENDISE) {
            poData.status = req.body.status || "PO_ISSUED";
            if (poData.status === "PO_ISSUED" && !poData.officialPONumber) {
                const randomString = Math.random().toString(36).substring(2, 6).toUpperCase();
                poData.officialPONumber = `PO-OFFICIAL-${Date.now()}-${randomString}`;
            }
        } else if (req.user.role === ROLES.WORKSHOPSTAFF) {
            poData.status = "REQUESTED";
        } else if (req.user.role === ROLES.WORKSHOPMANAGER) {
            poData.status = "MANAGER_APPROVED";
        } else {
            poData.status = req.body.status || "WAITING";
        }

        if ((!poData.linkedPRs || poData.linkedPRs.length === 0) && prsToUpdate.length > 0) {
            poData.linkedPRs = prsToUpdate.map(({ pr, allocQty }) => ({
                prId: pr._id,
                prNumber: pr.requestNumber,
                allocatedQuantity: allocQty,
                originalPRQuantity: pr.quantity
            }));
        }

        // Initialize Audit History with Creation Log
        const creatorName = req.user.fullName || req.user.name || (req.user.role ? req.user.role.replace(/_/g, ' ') : 'Workshop Manager');
        const linkedPRNames = prsToUpdate.length > 0
            ? prsToUpdate.map(({ pr, allocQty }) => `${pr.requestNumber} (${allocQty} unit(s))`).join(', ')
            : (Array.isArray(poData.linkedPRs) && poData.linkedPRs.length > 0 ? poData.linkedPRs.map(p => p.prNumber).join(', ') : '');

        const linkedPRSummary = linkedPRNames ? ` Connected to PR(s): ${linkedPRNames}.` : '';

        poData.editHistory = [{
            editedAt: new Date(),
            editedBy: req.user.id,
            editorRole: req.user.role,
            editorName: creatorName,
            action: "CREATED",
            previousStatus: "NONE",
            newStatus: poData.status,
            changesSummary: `PR Quotation ${poData.purchaseOrderNumber} created by ${creatorName} (${req.user.role}) with status: ${poData.status}.${linkedPRSummary}`,
            notes: poData.notes || ''
        }];

        const newPO = await addPurchaseOrderService(poData);

        // Update linked PRs atomically
        try {
            for (const { pr, allocQty } of prsToUpdate) {
                const prevFulfilled = Number(pr.fulfilledQuantity) || 0;
                const newFulfilled = prevFulfilled + allocQty;
                const newRemaining = Math.max(0, (Number(pr.quantity) || 0) - newFulfilled);

                pr.fulfilledQuantity = newFulfilled;
                pr.remainingQuantity = newRemaining;
                if (newRemaining === 0) {
                    pr.status = "CONVERTED_TO_PO";
                } else {
                    pr.status = "PARTIALLY_CONVERTED";
                }

                if (!pr.linkedPOs) pr.linkedPOs = [];
                pr.linkedPOs.push({
                    poId: newPO._id,
                    poNumber: newPO.purchaseOrderNumber,
                    allocatedQuantity: allocQty,
                    allocatedAt: new Date()
                });
                await pr.save();
            }
        } catch (allocErr) {
            console.error("[PurchaseOrderController] Error updating linked PR allocations:", allocErr);
        }

        return res.status(201).json({ success: true, data: newPO });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

const ensureLinkedPRs = (po) => {
    if (!po) return po;
    const poObj = po.toObject ? po.toObject() : po;

    // 1. Ensure linkedPRs
    if (!Array.isArray(poObj.linkedPRs) || poObj.linkedPRs.length === 0) {
        const prMap = new Map();
        if (Array.isArray(poObj.items)) {
            poObj.items.forEach(it => {
                if (Array.isArray(it.prAllocations)) {
                    it.prAllocations.forEach(alloc => {
                        const num = alloc.prNumber || alloc.prId;
                        if (num && !prMap.has(String(num))) {
                            prMap.set(String(num), {
                                prId: alloc.prId,
                                prNumber: alloc.prNumber || String(alloc.prId),
                                allocatedQuantity: alloc.allocatedQuantity || it.quantity || 0,
                                originalPRQuantity: alloc.originalPRQuantity || 0
                            });
                        }
                    });
                }
                if (it.description) {
                    const match = it.description.match(/(PR-OW-[\w-]+)/i);
                    if (match && match[1]) {
                        const prNum = match[1].trim();
                        if (!prMap.has(prNum)) {
                            prMap.set(prNum, {
                                prNumber: prNum,
                                allocatedQuantity: it.quantity || 0
                            });
                        }
                    }
                }
            });
        }

        if (poObj.purchaseOrderNumber && poObj.purchaseOrderNumber.includes("PR-OW-")) {
            const match = poObj.purchaseOrderNumber.match(/(PR-OW-[\w-]+)/i);
            if (match && match[1] && !prMap.has(match[1])) {
                prMap.set(match[1], {
                    prNumber: match[1],
                    allocatedQuantity: 0
                });
            }
        }

        if (prMap.size > 0) {
            poObj.linkedPRs = Array.from(prMap.values());
            PurchaseOrder.updateOne({ _id: poObj._id }, { $set: { linkedPRs: poObj.linkedPRs } }).catch(() => {});
        }
    }

    // 2. Ensure initial creation editHistory log if missing
    if (!Array.isArray(poObj.editHistory) || poObj.editHistory.length === 0) {
        const creatorName = poObj.createdBy?.fullName || poObj.createdBy?.name || (poObj.creatorRole ? poObj.creatorRole.replace(/_/g, ' ') : 'Workshop Manager');
        const linkedPRNames = Array.isArray(poObj.linkedPRs) && poObj.linkedPRs.length > 0
            ? poObj.linkedPRs.map(p => p.prNumber).join(', ')
            : '';
        const linkedSummary = linkedPRNames ? ` Connected to PR(s): ${linkedPRNames}.` : '';

        poObj.editHistory = [{
            editedAt: poObj.createdAt || new Date(),
            editedBy: poObj.createdBy?._id || poObj.createdBy,
            editorRole: poObj.creatorRole || 'WORKSHOPMANAGER',
            editorName: creatorName,
            action: 'CREATED',
            previousStatus: 'NONE',
            newStatus: poObj.status || 'WAITING',
            changesSummary: `PR Quotation ${poObj.purchaseOrderNumber} created by ${creatorName} with status: ${poObj.status || 'WAITING'}.${linkedSummary}`,
            notes: poObj.notes || ''
        }];
        PurchaseOrder.updateOne({ _id: poObj._id }, { $set: { editHistory: poObj.editHistory } }).catch(() => {});
    }

    return poObj;
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
        let baseQuery = {};

        // 1. Role-based scoping (Base Query)
        if ([ROLES.BRANCHMANAGER, ROLES.WORKSHOPMANAGER].includes(role)) {
            baseQuery.branch = req.user.branchId;
        } else if ([ROLES.OPERATIONSTAFF, ROLES.FINANCESTAFF, ROLES.WORKSHOPSTAFF].includes(role)) {
            if (req.user.branchId) {
                baseQuery.branch = req.user.branchId;
            } else {
                baseQuery.createdBy = req.user.id;
            }
        } else if (role === ROLES.COUNTRYMANAGER) {
            if (!req.user.country) {
                return res.status(400).json({ success: false, message: "Country not assigned to your profile. Contact admin." });
            }

            const branches = await Branch.find({
                country: { $regex: new RegExp(`^${req.user.country}$`, "i") },
                isDeleted: false
            }).select("_id");

            const branchIds = branches.map(b => b._id);
            baseQuery.$or = [
                { branch: { $in: branchIds } },
                { createdBy: req.user.id }
            ];
        }

        // Auto-sync any released PRs that don't have PO quotations yet
        if ([ROLES.MERCHENDISE, ROLES.ADMIN, ROLES.FINANCEADMIN].includes(role)) {
            try {
                const WorkshopProcurement = require("../../WorkshopProcurement/Model/WorkshopProcurementModel.js");
                const unlinkedPRs = await WorkshopProcurement.find({
                    status: { $in: ["RELEASED", "APPROVED"] },
                    $or: [
                        { linkedPOs: { $size: 0 } },
                        { linkedPOs: { $exists: false } }
                    ]
                }).populate("part branch requestedBy");

                for (const pr of unlinkedPRs) {
                    const existing = await PurchaseOrder.findOne({ "linkedPRs.prId": pr._id });
                    if (!existing) {
                        const randomString = Math.random().toString(36).substring(2, 6).toUpperCase();
                        const poNumber = `PO-${Date.now()}-${randomString}`;
                        const newPO = new PurchaseOrder({
                            purchaseOrderNumber: poNumber,
                            branch: pr.branch?._id || pr.branch,
                            purpose: "Spare Parts",
                            status: "MANAGER_APPROVED",
                            createdBy: pr.requestedBy?._id || pr.requestedBy,
                            creatorRole: pr.requestedByRole || "WORKSHOPSTAFF",
                            totalAmount: Number(pr.quantity || 1) * Number(pr.part?.unitCost || 0),
                            items: [{
                                itemName: pr.partName || pr.part?.partName || "Spare Part",
                                quantity: Number(pr.quantity) || 1,
                                unitPrice: Number(pr.part?.unitCost) || 0,
                                description: pr.notes || pr.partNumber || "",
                                images: [pr.fullSizePhoto, pr.closeUpPhoto].filter(Boolean),
                                prAllocations: [{
                                    prId: pr._id,
                                    prNumber: pr.requestNumber,
                                    allocatedQuantity: Number(pr.quantity) || 1,
                                    originalPRQuantity: Number(pr.quantity) || 1
                                }]
                            }],
                            linkedPRs: [{
                                prId: pr._id,
                                prNumber: pr.requestNumber,
                                allocatedQuantity: Number(pr.quantity) || 1,
                                originalPRQuantity: Number(pr.quantity) || 1
                            }],
                            notes: pr.notes || "",
                            editHistory: [{
                                editedAt: new Date(),
                                editedBy: pr.requestedBy?._id || pr.requestedBy,
                                editorRole: "SYSTEM",
                                editorName: "System",
                                action: "CREATED",
                                previousStatus: "NONE",
                                newStatus: "MANAGER_APPROVED",
                                changesSummary: `PR Quotation ${poNumber} linked to Released PR ${pr.requestNumber}.`,
                                notes: pr.notes || ""
                            }]
                        });
                        await newPO.save();

                        if (!pr.linkedPOs) pr.linkedPOs = [];
                        pr.linkedPOs.push({
                            poId: newPO._id,
                            poNumber: newPO.purchaseOrderNumber,
                            allocatedQuantity: Number(pr.quantity) || 1,
                            allocatedAt: new Date()
                        });
                        await pr.save();
                    }
                }
            } catch (syncErr) {
                console.error("Error auto-syncing released PRs to PO quotations:", syncErr);
            }
        }

        // 2. Execute with queryHelper (Repository takes care of search/filter/sort/pagination)
        const result = await getPurchaseOrdersService(req.query, { baseQuery });

        return res.status(200).json({
            success: true,
            data: (result.data || []).map(ensureLinkedPRs),
            pagination: {
                total: result.total,
                page: result.page,
                limit: result.limit,
                totalPages: result.totalPages
            }
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Gets a Purchase Order by ID.
 */
const getPurchaseOrderById = async (req, res) => {
    try {
        let po = await getPurchaseOrderByIdService(req.params.id);
        if (!po) {
            po = await PurchaseOrder.findOne({ "linkedPRs.prId": req.params.id })
                .populate("supplier")
                .populate("branch")
                .populate("createdBy", "fullName name email role")
                .populate("approvedBy", "fullName name email role")
                .populate("editHistory.editedBy", "fullName name email role");
        }

        if (!po) {
            // Check if it's a Workshop Procurement request ID directly
            try {
                const WorkshopProcurement = require("../../WorkshopProcurement/Model/WorkshopProcurementModel.js");
                const pr = await WorkshopProcurement.findById(req.params.id).populate("part branch requestedBy");
                if (pr && ["RELEASED", "APPROVED", "WAITING_QUOTATION", "PARTIALLY_CONVERTED"].includes(pr.status)) {
                    const randomString = Math.random().toString(36).substring(2, 6).toUpperCase();
                    const poNumber = `PO-${Date.now()}-${randomString}`;
                    po = new PurchaseOrder({
                        purchaseOrderNumber: poNumber,
                        branch: pr.branch?._id || pr.branch,
                        purpose: "Spare Parts",
                        status: "MANAGER_APPROVED",
                        createdBy: pr.requestedBy?._id || pr.requestedBy,
                        creatorRole: pr.requestedByRole || "WORKSHOPSTAFF",
                        totalAmount: Number(pr.quantity || 1) * Number(pr.part?.unitCost || 0),
                        items: [{
                            itemName: pr.partName || pr.part?.partName || "Spare Part",
                            quantity: Number(pr.quantity) || 1,
                            unitPrice: Number(pr.part?.unitCost) || 0,
                            description: pr.notes || pr.partNumber || "",
                            images: [pr.fullSizePhoto, pr.closeUpPhoto].filter(Boolean),
                            prAllocations: [{
                                prId: pr._id,
                                prNumber: pr.requestNumber,
                                allocatedQuantity: Number(pr.quantity) || 1,
                                originalPRQuantity: Number(pr.quantity) || 1
                            }]
                        }],
                        linkedPRs: [{
                            prId: pr._id,
                            prNumber: pr.requestNumber,
                            allocatedQuantity: Number(pr.quantity) || 1,
                            originalPRQuantity: Number(pr.quantity) || 1
                        }],
                        notes: pr.notes || "",
                        editHistory: [{
                            editedAt: new Date(),
                            editedBy: req.user.id,
                            editorRole: req.user.role,
                            editorName: req.user.fullName || req.user.name || "System",
                            action: "CREATED",
                            previousStatus: "NONE",
                            newStatus: "MANAGER_APPROVED",
                            changesSummary: `PR Quotation ${poNumber} linked to Released PR ${pr.requestNumber}.`,
                            notes: pr.notes || ""
                        }]
                    });
                    await po.save();

                    if (!pr.linkedPOs) pr.linkedPOs = [];
                    pr.linkedPOs.push({
                        poId: po._id,
                        poNumber: po.purchaseOrderNumber,
                        allocatedQuantity: Number(pr.quantity) || 1,
                        allocatedAt: new Date()
                    });
                    await pr.save();
                }
            } catch (prErr) {
                console.error("Error creating PO quotation from PR:", prErr);
            }
        }

        if (!po) {
            return res.status(404).json({ success: false, message: "Purchase Order not found" });
        }

        let poObj = ensureLinkedPRs(po);

        try {
            if (po.purchaseOrderNumber && po.purchaseOrderNumber.startsWith("PO-PR-")) {
                const prNumber = po.purchaseOrderNumber.replace("PO-PR-", "");
                const WorkshopProcurement = require("../../WorkshopProcurement/Model/WorkshopProcurementModel.js");
                const linkedPR = await WorkshopProcurement.findOne({ requestNumber: prNumber })
                    .populate("editHistory.editedBy", "fullName name email role")
                    .populate("part")
                    .populate("branch")
                    .populate("requestedBy", "fullName name email role")
                    .populate("approvedBy", "fullName name email role");
                if (linkedPR) {
                    poObj.linkedPR = linkedPR;
                }
            }
        } catch (prErr) {
            console.error("Failed to lookup linked PR:", prErr);
        }

        return res.status(200).json({ success: true, data: poObj });
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
        const { status, supplier, rejectionNote, rejectionReason } = req.body;
        const note = rejectionNote || rejectionReason || "";
        const approverRole = req.user.role;
        const approverId = req.user.id;

        // Validate status
        if (!["APPROVED", "REJECTED", "MANAGER_APPROVED", "PENDING_FINANCE_APPROVAL", "RECEIVED"].includes(status)) {
            return res.status(400).json({ success: false, message: "Invalid status. Must be APPROVED, REJECTED, MANAGER_APPROVED, PENDING_FINANCE_APPROVAL, or RECEIVED." });
        }

        const currentPO = await getPurchaseOrderByIdService(poId);
        if (!currentPO) {
            return res.status(404).json({ success: false, message: "Purchase Order not found." });
        }

        const isReceiving = status === "RECEIVED";

        if (isReceiving) {
            if (currentPO.status !== "APPROVED") {
                return res.status(400).json({ success: false, message: "Only approved Purchase Orders can be marked as received." });
            }
        } else {
            if (!["WAITING", "REQUESTED", "MANAGER_APPROVED", "PENDING_FINANCE_APPROVAL"].includes(currentPO.status)) {
                return res.status(400).json({ success: false, message: "Purchase order is already processed." });
            }
        }

        // Rule 6: No self-approval (Always enforced unless receiving)
        if (!isReceiving && currentPO.createdBy._id.toString() === approverId) {
            return res.status(403).json({ success: false, message: "You cannot approve your own Purchase Order." });
        }

        const isFinanceApproval = currentPO.status === "PENDING_FINANCE_APPROVAL";

        if (isReceiving) {
            // For marking as received, we restrict to Admin and Financial Admin roles
            if (approverRole !== ROLES.ADMIN && approverRole !== ROLES.FINANCEADMIN) {
                return res.status(403).json({
                    success: false,
                    message: "Only Admin and Financial Admin can mark a Purchase Order as received.",
                });
            }
        } else if (!isFinanceApproval) {
            // Rule 1: Hierarchical check — approver level must be > creator level
            const creatorLevel = ROLE_LEVEL[currentPO.creatorRole] || 0;
            const approverLevel = ROLE_LEVEL[approverRole] || 0;

            if (approverLevel <= creatorLevel) {
                return res.status(403).json({
                    success: false,
                    message: `Role "${approverRole}" (Level ${approverLevel}) cannot approve POs created by "${currentPO.creatorRole}" (Level ${creatorLevel}). Approver must be a higher level.`,
                });
            }

            // Rule 5: Dynamic threshold check (Default $1000) using proposed amount if available
            const threshold = (await getSetting("poApprovalThreshold")) || 1000;
            const activeAmount = currentPO.merchandiserTotalAmount !== undefined && currentPO.merchandiserTotalAmount !== null ? currentPO.merchandiserTotalAmount : currentPO.totalAmount;
            if (activeAmount > threshold && approverRole !== ROLES.ADMIN) {
                return res.status(403).json({
                    success: false,
                    message: `Purchase Orders over ${threshold} can only be approved by ADMIN. This PO total: $${activeAmount}.`,
                });
            }
        } else {
            // For PENDING_FINANCE_APPROVAL, only ADMIN or FINANCEADMIN can approve/reject
            if (approverRole !== ROLES.ADMIN && approverRole !== ROLES.FINANCEADMIN) {
                return res.status(403).json({
                    success: false,
                    message: "Only Admin and Financial Admin can approve or reject the Proposed Merchandiser Amount.",
                });
            }
        }

        // Rules 2 & 3: Branch / Country scoping
        const poBranchId = currentPO.branch._id ? currentPO.branch._id.toString() : currentPO.branch.toString();

        if (!isReceiving && !isFinanceApproval && approverRole === ROLES.BRANCHMANAGER) {
            // Rule 2: BM can only approve POs from their branch
            if (req.user.branchId.toString() !== poBranchId) {
                return res.status(403).json({
                    success: false,
                    message: "You can only approve Purchase Orders from your own branch.",
                });
            }
        } else if (!isReceiving && !isFinanceApproval && approverRole === ROLES.COUNTRYMANAGER) {
            // Rule 3: CM can only approve POs from branches in their country
            const poBranch = await Branch.findById(poBranchId).select("country");
            if (!poBranch || poBranch.country !== req.user.country) {
                return res.status(403).json({
                    success: false,
                    message: "You can only approve Purchase Orders from branches in your country.",
                });
            }
        }

        // All checks passed — update status, prices, total amount, and edit history
        const previousStatus = currentPO.status;
        currentPO.status = status;
        currentPO.approvedBy = approverId;
        currentPO.approverRole = approverRole;
        if (supplier) {
            currentPO.supplier = supplier;
        }

        const approverName = req.user.fullName || req.user.name || (req.user.role ? req.user.role.replace(/_/g, ' ') : 'Approver');
        const historyRecord = {
            editedAt: new Date(),
            editedBy: approverId,
            editorRole: approverRole,
            editorName: approverName,
            action: status === "APPROVED" ? "APPROVED" : status === "REJECTED" ? "REJECTED" : status === "RECEIVED" ? "RECEIVED" : status,
            previousStatus: previousStatus,
            newStatus: status,
            notes: note || '',
            changesSummary: ""
        };

        if (status === "APPROVED") {
            currentPO.approvalNote = note;
            if (currentPO.merchandiserTotalAmount !== undefined && currentPO.merchandiserTotalAmount !== null) {
                currentPO.originalTotalAmount = currentPO.totalAmount;
                currentPO.totalAmount = currentPO.merchandiserTotalAmount;
                historyRecord.changesSummary = `Approved merchandiser pricing. Total amount updated from original $${currentPO.originalTotalAmount} to proposed $${currentPO.totalAmount}.`;
            } else {
                historyRecord.changesSummary = `Approved Purchase Order quotation.`;
            }

            currentPO.items = currentPO.items.map(item => {
                if (item.merchandiserPrice !== undefined && item.merchandiserPrice !== null) {
                    item.unitPrice = item.merchandiserPrice;
                }
                return item;
            });
        } else if (status === "REJECTED") {
            currentPO.rejectionNote = note;
            historyRecord.changesSummary = `Revision requested for quotation. Note: "${note || 'No note provided'}"`;
        } else if (status === "RECEIVED") {
            historyRecord.changesSummary = `Purchase Order marked as RECEIVED.`;
        } else {
            historyRecord.changesSummary = `Status updated to ${status}.`;
        }

        if (!Array.isArray(currentPO.editHistory)) {
            currentPO.editHistory = [];
        }

        // If no prior history existed, add the creation entry first
        if (currentPO.editHistory.length === 0) {
            const creatorName = currentPO.createdBy?.fullName || currentPO.createdBy?.name || (currentPO.creatorRole ? currentPO.creatorRole.replace(/_/g, ' ') : 'Workshop Manager');
            currentPO.editHistory.push({
                editedAt: currentPO.createdAt || new Date(),
                editedBy: currentPO.createdBy?._id || currentPO.createdBy,
                editorRole: currentPO.creatorRole || 'WORKSHOPMANAGER',
                editorName: creatorName,
                action: 'CREATED',
                previousStatus: 'NONE',
                newStatus: previousStatus,
                changesSummary: `PR Quotation ${currentPO.purchaseOrderNumber} created by ${creatorName} with status: ${previousStatus}.`,
                notes: currentPO.notes || ''
            });
        }

        currentPO.editHistory.push(historyRecord);
        await currentPO.save();

        // Trigger draft fixed asset creation if PO status is RECEIVED
        if (status === "RECEIVED") {
            try {
                const FixedAssetService = require("../../FixedAsset/Service/FixedAssetService");
                await FixedAssetService.autoCreateDraftAssetsFromPO(currentPO._id, { id: approverId, role: approverRole });
            } catch (faErr) {
                console.error("[PurchaseOrderController] Failed to trigger auto fixed asset creation:", faErr);
            }
        }

        return res.status(200).json({ success: true, data: currentPO });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

const uploadPODocument = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: "No document provided for upload." });
        }

        let uploadedUrl;
        try {
            // Try S3 first
            uploadedUrl = await uploadToS3(req.file, "purchase-orders/documents");
        } catch (s3Error) {
            console.log("[Upload] S3 upload failed or not configured, falling back to local storage:", s3Error.message);
            uploadedUrl = uploadLocal(req.file, "purchase-orders/documents");
        }

        return res.status(200).json({
            success: true,
            message: "Document uploaded successfully.",
            data: {
                url: uploadedUrl,
                originalName: req.file.originalname
            }
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

const auditPurchaseOrder = async (req, res) => {
    try {
        const { items, documents, supplierDetails } = req.body;

        if (!items || !Array.isArray(items)) {
            return res.status(400).json({ success: false, message: "Items array is required for audit." });
        }

        const po = await getPurchaseOrderByIdService(id);
        if (!po) {
            return res.status(404).json({ success: false, message: "Purchase Order not found." });
        }

        // Update each item's merchandiserPrice
        let merchandiserTotalAmount = 0;
        const updatedItems = po.items.map(item => {
            const auditItem = items.find(i => i.id === item._id.toString() || i.itemName === item.itemName);
            if (auditItem && auditItem.supplierUnitPrice !== undefined) {
                item.merchandiserPrice = Number(auditItem.supplierUnitPrice);
            } else if (item.merchandiserPrice === undefined || item.merchandiserPrice === null) {
                item.merchandiserPrice = item.unitPrice;
            }
            merchandiserTotalAmount += item.quantity * (item.merchandiserPrice || item.unitPrice);
            return item;
        });

        po.items = updatedItems;
        po.merchandiserTotalAmount = merchandiserTotalAmount;
        if (documents && Array.isArray(documents)) {
            po.documents = documents;
        }

        if (supplierDetails) {
            po.supplierDetails = {
                name: supplierDetails.name || "",
                email: supplierDetails.email || "",
                phone: supplierDetails.phone || "",
                address: supplierDetails.address || "",
            };
        }

        // Set status to PENDING_FINANCE_APPROVAL
        const previousStatus = po.status;
        po.status = "PENDING_FINANCE_APPROVAL";

        // Add history record
        po.editHistory.push({
            editedAt: new Date(),
            editedBy: req.user.id,
            editorRole: req.user.role,
            previousStatus: previousStatus,
            changesSummary: `Merchandiser completed PO audit. Proposed amount: ${merchandiserTotalAmount}. Documents uploaded: ${(documents || []).length}.`
        });

        await po.save();

        return res.status(200).json({
            success: true,
            message: "Purchase Order audited and submitted for approval successfully.",
            data: po
        });
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

/**
 * Upload images for a specific item in a Purchase Order.
 * Supports up to 8 images per item.
 */
const uploadPurchaseOrderItemImages = async (req, res) => {
    try {
        const { id, itemId } = req.params;
        const files = req.files?.images || req.files; // Depending on multer config

        // Ensure array of files
        let imageFiles = [];
        if (Array.isArray(files)) {
            imageFiles = files;
        } else if (files && files.images) {
            imageFiles = files.images;
        }

        if (!imageFiles || imageFiles.length === 0) {
            return res.status(400).json({ success: false, message: "No images provided for upload." });
        }

        // Fetch Po
        const po = await getPurchaseOrderByIdService(id);
        if (!po) {
            return res.status(404).json({ success: false, message: "Purchase Order not found." });
        }

        // Check Permissions: original creator or Admin can edit.
        if (po.createdBy._id.toString() !== req.user.id && req.user.role !== ROLES.ADMIN) {
            return res.status(403).json({ success: false, message: "You don't have permission to upload images for this Purchase Order." });
        }

        // Check Item exists
        const item = po.items.find((i) => i._id.toString() === itemId);
        if (!item) {
            return res.status(404).json({ success: false, message: "Item not found in this Purchase Order." });
        }

        // Check limit
        if (item.images.length + imageFiles.length > 8) {
            return res.status(400).json({
                success: false,
                message: `Cannot upload more than 8 images. Item currently has ${item.images.length} images.`
            });
        }

        const uploadedUrls = [];

        // Upload loop
        for (const file of imageFiles) {
            const folder = `purchase-orders/${po._id}/items/${item._id}`;
            const uploadedUrl = await uploadToS3(file, folder);
            uploadedUrls.push(uploadedUrl);
        }

        // Update item images array
        item.images.push(...uploadedUrls);

        // PO standard edit rules: mark as edited, reset status to waiting, record history
        po.isEdited = true;
        const previousStatus = po.status;
        po.status = "WAITING";

        po.editHistory.push({
            editedAt: new Date(),
            editedBy: req.user.id,
            editorRole: req.user.role,
            previousStatus: previousStatus,
            changesSummary: `Uploaded ${imageFiles.length} images for item: ${item.itemName}.`,
        });

        // Save
        await po.save();

        return res.status(200).json({
            success: true,
            message: "Images uploaded successfully.",
            data: uploadedUrls,
            po: po
        });

    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Gets Purchase Orders eligible for billing.
 * Filters: status = APPROVED, isBilled = false, country = user's country.
 */
const getEligiblePurchaseOrdersForBilling = async (req, res) => {
    try {
        const { role } = req.user;
        let baseQuery = {
            status: "APPROVED",
            isBilled: { $ne: true }
        };

        // Determine the user's country context
        let userCountry = req.user.country;
        if (!userCountry && req.user.branchId) {
            const branch = await Branch.findById(req.user.branchId).select("country");
            if (branch) userCountry = branch.country;
        }

        if (!userCountry && role !== ROLES.ADMIN && role !== ROLES.OPERATIONADMIN && role !== ROLES.FINANCEADMIN) {
            return res.status(400).json({ success: false, message: "Country information not found for your account." });
        }

        // Filter by country if not a global admin
        if (userCountry) {
            const branchesInCountry = await Branch.find({
                country: { $regex: new RegExp(`^${userCountry}$`, "i") },
                isDeleted: false
            }).select("_id");

            const branchIds = branchesInCountry.map(b => b._id);
            baseQuery.branch = { $in: branchIds };
        }

        const result = await getPurchaseOrdersService(req.query, { baseQuery });

        return res.status(200).json({
            success: true,
            data: (result.data || []).map(ensureLinkedPRs),
            pagination: {
                total: result.total,
                page: result.page,
                limit: result.limit,
                totalPages: result.totalPages
            }
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

const bulkUploadPurchaseOrders = async (req, res) => {
    try {
        const { rows } = req.body;
        if (!rows || !Array.isArray(rows) || rows.length === 0) {
            return res.status(400).json({ success: false, message: "No data rows provided for bulk upload." });
        }
        const actor = { id: req.user.id || req.user._id, role: req.user.role };
        const result = await PurchaseOrderService.bulkUploadPurchaseOrders(rows, actor, req.user.branchId);
        return res.status(201).json({ success: true, message: "Bulk upload processed", data: result });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Merchandiser requests revision from Finance Admin / Admin.
 * Status becomes REVISION_REQUESTED.
 */
const requestRevision = async (req, res) => {
    try {
        const { id } = req.params;
        const { reason } = req.body;
        const po = await PurchaseOrder.findById(id);
        if (!po) {
            return res.status(404).json({ success: false, message: "Purchase Order not found" });
        }

        const previousStatus = po.status;
        po.status = "REVISION_REQUESTED";
        po.revisionReason = reason;

        const userName = req.user.fullName || req.user.name || "Merchandiser";
        if (!Array.isArray(po.editHistory)) po.editHistory = [];
        po.editHistory.push({
            editedAt: new Date(),
            editedBy: req.user.id,
            editorRole: req.user.role,
            editorName: userName,
            action: "REVISION_REQUESTED",
            previousStatus,
            newStatus: "REVISION_REQUESTED",
            changesSummary: `Revision requested by ${userName}. Reason: "${reason}". Sent to Finance for review.`,
            notes: reason,
        });

        await po.save();
        return res.status(200).json({ success: true, data: ensureLinkedPRs(po), message: "Revision requested successfully" });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Finance Admin / Admin reviews revision request.
 * If APPROVE: status becomes REVISION_APPROVED, isRevisionAllowed = true.
 * If REJECT: status returns to previous status (e.g. MANAGER_APPROVED or WAITING), isRevisionAllowed = false.
 */
const reviewRevision = async (req, res) => {
    try {
        const { id } = req.params;
        const { decision, note } = req.body;
        const po = await PurchaseOrder.findById(id);
        if (!po) {
            return res.status(404).json({ success: false, message: "Purchase Order not found" });
        }

        const previousStatus = po.status;
        const userName = req.user.fullName || req.user.name || (req.user.role === ROLES.ADMIN ? "Admin" : "Finance Admin");

        if (decision === "APPROVE") {
            po.status = "REVISION_APPROVED";
            po.isRevisionAllowed = true;
            po.revisionDecisionNote = note || "Revision approved. Merchandiser may edit line items.";
        } else {
            po.status = "REJECTED";
            po.isRevisionAllowed = false;
            po.revisionDecisionNote = note || "Revision request denied by Finance.";
        }

        if (!Array.isArray(po.editHistory)) po.editHistory = [];
        po.editHistory.push({
            editedAt: new Date(),
            editedBy: req.user.id,
            editorRole: req.user.role,
            editorName: userName,
            action: decision === "APPROVE" ? "REVISION_APPROVED" : "REVISION_DENIED",
            previousStatus,
            newStatus: po.status,
            changesSummary: decision === "APPROVE" 
                ? `Finance (${userName}) approved revision request. Quotation line items unlocked for editing.`
                : `Finance (${userName}) denied revision request. Quotation remains in previous state.`,
            notes: note || "",
        });

        await po.save();
        return res.status(200).json({ success: true, data: ensureLinkedPRs(po), message: `Revision request ${decision === 'APPROVE' ? 'approved' : 'denied'}` });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Merchandiser resubmits modified line items & pricing to Finance Admin / Admin.
 * Status becomes PENDING_FINANCE_APPROVAL, isRevisionAllowed = false.
 */
const resubmitProposal = async (req, res) => {
    try {
        const { id } = req.params;
        const { items, notes } = req.body;
        const po = await PurchaseOrder.findById(id);
        if (!po) {
            return res.status(404).json({ success: false, message: "Purchase Order not found" });
        }

        const previousStatus = po.status;
        let calculatedProposedTotal = 0;
        let calculatedBaseTotal = 0;

        const updatedItems = items.map((item, idx) => {
            const existingItem = (po.items || [])[idx] || {};
            const qty = Number(item.quantity) || Number(existingItem.quantity) || 1;
            const originalUnitPrice = Number(item.unitPrice) !== undefined ? Number(item.unitPrice) : Number(existingItem.unitPrice) || 0;
            const merchPrice = item.merchandiserPrice !== undefined && item.merchandiserPrice !== null 
                ? Number(item.merchandiserPrice) 
                : (existingItem.merchandiserPrice !== undefined ? Number(existingItem.merchandiserPrice) : originalUnitPrice);

            calculatedBaseTotal += qty * originalUnitPrice;
            calculatedProposedTotal += qty * merchPrice;

            return {
                ...existingItem.toObject ? existingItem.toObject() : existingItem,
                itemName: item.itemName || existingItem.itemName,
                quantity: qty,
                unitPrice: originalUnitPrice,
                merchandiserPrice: merchPrice,
                description: item.description !== undefined ? item.description : existingItem.description,
                accountId: item.accountId || existingItem.accountId,
                prAllocations: item.prAllocations || existingItem.prAllocations || [],
                images: item.images || existingItem.images || []
            };
        });

        po.items = updatedItems;
        po.originalTotalAmount = calculatedBaseTotal;
        po.merchandiserTotalAmount = calculatedProposedTotal;
        po.totalAmount = calculatedProposedTotal;
        po.status = "PENDING_FINANCE_APPROVAL";
        po.isRevisionAllowed = false;
        if (notes) po.notes = notes;

        const userName = req.user.fullName || req.user.name || "Merchandiser";
        if (!Array.isArray(po.editHistory)) po.editHistory = [];
        po.editHistory.push({
            editedAt: new Date(),
            editedBy: req.user.id,
            editorRole: req.user.role,
            editorName: userName,
            action: "PROPOSAL_RESUBMITTED",
            previousStatus,
            newStatus: "PENDING_FINANCE_APPROVAL",
            changesSummary: `Merchandiser (${userName}) resubmitted revised quotation line items & parts. Total proposed amount: $${calculatedProposedTotal.toFixed(2)}. Sent to Finance for approval.`,
            notes: notes || "",
        });

        await po.save();
        return res.status(200).json({ success: true, data: ensureLinkedPRs(po), message: "Proposal resubmitted for Finance approval" });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Merchandiser issues the official Purchase Order from the approved quotation.
 * Finalizes supplier, delivery terms, sets status to PO_ISSUED (or APPROVED).
 */
const issueOfficialPO = async (req, res) => {
    try {
        const { id } = req.params;
        const { supplier, supplierDetails, deliveryDate, paymentTerms, shippingTerms, notes } = req.body;
        const po = await PurchaseOrder.findById(id);
        if (!po) {
            return res.status(404).json({ success: false, message: "Purchase Order not found" });
        }

        const previousStatus = po.status;
        if (supplier) po.supplier = supplier;
        if (supplierDetails) po.supplierDetails = supplierDetails;
        if (deliveryDate) po.deliveryDate = deliveryDate;
        if (paymentTerms) po.paymentTerms = paymentTerms;
        if (shippingTerms) po.shippingTerms = shippingTerms;
        if (notes) po.notes = notes;

        po.status = "PO_ISSUED";
        const randomString = Math.random().toString(36).substring(2, 6).toUpperCase();
        po.officialPONumber = `PO-OFFICIAL-${Date.now()}-${randomString}`;

        const userName = req.user.fullName || req.user.name || "Merchandiser";
        if (!Array.isArray(po.editHistory)) po.editHistory = [];
        po.editHistory.push({
            editedAt: new Date(),
            editedBy: req.user.id,
            editorRole: req.user.role,
            editorName: userName,
            action: "PO_ISSUED",
            previousStatus,
            newStatus: "PO_ISSUED",
            changesSummary: `Official Purchase Order issued by ${userName} (${po.officialPONumber}). Supplier: ${po.supplierDetails?.name || 'Selected Supplier'}, Delivery: ${deliveryDate ? new Date(deliveryDate).toLocaleDateString() : 'Standard'}.`,
            notes: notes || "",
        });

        await po.save();
        return res.status(200).json({ success: true, data: ensureLinkedPRs(po), message: "Official Purchase Order issued successfully" });
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
    uploadPurchaseOrderItemImages,
    getEligiblePurchaseOrdersForBilling,
    uploadPODocument,
    auditPurchaseOrder,
    bulkUploadPurchaseOrders,
    requestRevision,
    reviewRevision,
    resubmitProposal,
    issueOfficialPO,
};
