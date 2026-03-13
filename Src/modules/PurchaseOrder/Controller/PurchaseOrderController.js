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
            const awsRegion = process.env.AWS_REGION || "ap-south-1";
            const awsBucket = process.env.AWS_BUCKET_NAME || "ola-cars-uploads-2026";
            const s3Domain = `https://${awsBucket}.s3.${awsRegion}.amazonaws.com`;
            
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
                    const cleanName = file.originalname.replace(/[^a-zA-Z0-9.]/g, "");
                    const key = `purchase-orders/temp-${poData.purchaseOrderNumber}/items/${i}/${Date.now()}_${cleanName}`;
                    const uploadedKey = await uploadToS3(file, key);
                    uploadedUrls.push(`${s3Domain}/${uploadedKey}`);
                }
                // Assign explicitly back to the original array reference
                poData.items[i].images = uploadedUrls;
            }
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
        const { purpose, isUsed } = req.query; // Extract purpose and isUsed from query string
        let query = {};

        // Filter by purpose if provided
        if (purpose) {
            query.purpose = purpose;
            if (purpose === "Vehicle") {
                query.status = "APPROVED"; // Vehicle onboarding only uses approved POs
            }
        }

        // Filter by isUsed if provided
        if (isUsed !== undefined) {
            if (isUsed === "false") {
                query.isUsed = { $ne: true };
            } else {
                query.isUsed = true;
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
            if (!req.user.country) {
                return res.status(400).json({ success: false, message: "Country not assigned to your profile. Contact admin." });
            }

            // Find branches in the same country (case-insensitive)
            const branches = await Branch.find({
                country: { $regex: new RegExp(`^${req.user.country}$`, "i") },
                isDeleted: false
            }).select("_id");

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

        // Rule 5: Dynamic threshold check (Default $1000)
        const threshold = (await getSetting("poApprovalThreshold")) || 1000;
        if (currentPO.totalAmount > threshold && approverRole !== ROLES.ADMIN) {
            return res.status(403).json({
                success: false,
                message: `Purchase Orders over ${threshold} can only be approved by ADMIN. This PO total: $${currentPO.totalAmount}.`,
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
        const awsRegion = process.env.AWS_REGION || "ap-south-1";
        const awsBucket = process.env.AWS_BUCKET_NAME || "ola-cars-uploads-2026";
        const s3Domain = `https://${awsBucket}.s3.${awsRegion}.amazonaws.com`;

        // Upload loop
        for (const file of imageFiles) {
            const cleanName = file.originalname.replace(/[^a-zA-Z0-9.]/g, "");
            const key = `purchase-orders/${po._id}/items/${item._id}/${Date.now()}_${cleanName}`;
            const uploadedKey = await uploadToS3(file, key);
            uploadedUrls.push(`${s3Domain}/${uploadedKey}`);
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

module.exports = {
    addPurchaseOrder,
    getPurchaseOrders,
    getPurchaseOrderById,
    approvePurchaseOrder,
    editPurchaseOrder,
    uploadPurchaseOrderItemImages,
};
