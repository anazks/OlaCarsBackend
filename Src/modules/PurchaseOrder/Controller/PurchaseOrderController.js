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

        // Set status based on role
        if (req.user.role === ROLES.ADMIN) {
            poData.status = "APPROVED";
            poData.approvedBy = req.user.id;
            poData.approverRole = req.user.role;
        } else if (req.user.role === ROLES.WORKSHOPSTAFF) {
            poData.status = "REQUESTED";
        } else if (req.user.role === ROLES.WORKSHOPMANAGER) {
            poData.status = "MANAGER_APPROVED";
        } else {
            poData.status = "WAITING";
        }

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

        // 2. Execute with queryHelper (Repository takes care of search/filter/sort/pagination)
        const result = await getPurchaseOrdersService(req.query, { baseQuery });

        return res.status(200).json({
            success: true,
            data: result.data,
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
        const po = await getPurchaseOrderByIdService(req.params.id);
        if (!po) {
            return res.status(404).json({ success: false, message: "Purchase Order not found" });
        }

        let poObj = po.toObject ? po.toObject() : po;

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

        const historyRecord = {
            editedAt: new Date(),
            editedBy: approverId,
            editorRole: approverRole,
            previousStatus: previousStatus,
            changesSummary: ""
        };

        if (status === "APPROVED") {
            currentPO.approvalNote = note;
            if (currentPO.merchandiserTotalAmount !== undefined && currentPO.merchandiserTotalAmount !== null) {
                currentPO.originalTotalAmount = currentPO.totalAmount;
                currentPO.totalAmount = currentPO.merchandiserTotalAmount;
                historyRecord.changesSummary = `Approved merchandiser pricing. Total amount updated from original $${currentPO.originalTotalAmount} to proposed $${currentPO.totalAmount}.`;
            } else {
                historyRecord.changesSummary = `Approved Purchase Order.`;
            }

            currentPO.items = currentPO.items.map(item => {
                if (item.merchandiserPrice !== undefined && item.merchandiserPrice !== null) {
                    item.unitPrice = item.merchandiserPrice;
                }
                return item;
            });
        } else if (status === "REJECTED") {
            currentPO.rejectionNote = note;
            historyRecord.changesSummary = `Rejected merchandiser proposed pricing. Note: "${note || 'No note provided'}"`;
        } else if (status === "RECEIVED") {
            historyRecord.changesSummary = `Purchase Order marked as RECEIVED.`;
        } else {
            historyRecord.changesSummary = `Status updated to ${status}.`;
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
            data: result.data,
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
};
