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
const getPresignedUrl = require("../../../utils/getPresignedUrl");

// ─── Role Hierarchy Levels ────────────────────────────────────────────
const ROLE_LEVEL = {
    [ROLES.OPERATIONSTAFF]: 1, [ROLES.FINANCESTAFF]: 1, [ROLES.WORKSHOPSTAFF]: 1,
    [ROLES.BRANCHMANAGER]: 2, [ROLES.WORKSHOPMANAGER]: 2, [ROLES.COUNTRYMANAGER]: 3,
    [ROLES.OPERATIONADMIN]: 4, [ROLES.FINANCEADMIN]: 4, [ROLES.ADMIN]: 5,
};

const BRANCH_SCOPED_ROLES = [ROLES.OPERATIONSTAFF, ROLES.FINANCESTAFF, ROLES.WORKSHOPSTAFF, ROLES.BRANCHMANAGER, ROLES.WORKSHOPMANAGER];

/**
 * Helper to process all S3 URLs in a PO object.
 */
const processPOS3Urls = async (po) => {
    if (!po) return null;
    const obj = typeof po.toObject === 'function' ? po.toObject() : po;

    if (obj.items && Array.isArray(obj.items)) {
        for (let i = 0; i < obj.items.length; i++) {
            if (obj.items[i].images && Array.isArray(obj.items[i].images)) {
                obj.items[i].images = await Promise.all(obj.items[i].images.map(url => getPresignedUrl(url)));
            }
        }
    }
    return obj;
};

/**
 * Creates a new Purchase Order.
 */
const addPurchaseOrder = async (req, res) => {
    try {
        let poData = req.body;

        // Parse items if they are sent as flat indexed keys
        if (!poData.items || !Array.isArray(poData.items)) {
            const itemsMap = new Map();
            Object.keys(poData).forEach((key) => {
                const match = key.match(/^items\[(\d+)\]\[(.*?)\]$/);
                if (match) {
                    const index = match[1];
                    const field = match[2];
                    if (!itemsMap.has(index)) itemsMap.set(index, {});
                    let value = poData[key];
                    if (field === 'quantity' || field === 'unitPrice') value = Number(value);
                    itemsMap.get(index)[field] = value;
                    delete poData[key];
                }
            });
            if (itemsMap.size > 0) poData.items = Array.from(itemsMap.values());
            else if (typeof poData.items === "string") poData.items = JSON.parse(poData.items);
        }

        if (BRANCH_SCOPED_ROLES.includes(req.user.role)) {
            if (!req.user.branchId) return res.status(400).json({ success: false, message: "No branch assigned." });
            poData.branch = req.user.branchId;
        } else if (!poData.branch) return res.status(400).json({ success: false, message: "Branch ID required." });

        poData.purchaseOrderNumber = `PO-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

        let calculatedTotal = 0;
        if (poData.items && Array.isArray(poData.items)) {
            for (let i = 0; i < poData.items.length; i++) {
                const item = poData.items[i];
                calculatedTotal += (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0);

                const fieldName = `items[${i}][images]`;
                const itemFiles = Array.isArray(req.files) ? req.files.filter(f => f.fieldname === fieldName) : [];

                const uploadedUrls = [];
                for (const file of itemFiles) {
                    const key = `purchase-orders/${poData.purchaseOrderNumber}/items/${i}/${Date.now()}_${file.originalname.replace(/[^a-zA-Z0-9.]/g, "")}`;
                    const url = await uploadToS3(file, key);
                    uploadedUrls.push(url);
                }
                poData.items[i].images = uploadedUrls;
            }
        }
        poData.totalAmount = calculatedTotal;
        poData.createdBy = req.user.id;
        poData.creatorRole = req.user.role;
        poData.status = req.user.role === ROLES.ADMIN ? "APPROVED" : (req.user.role === ROLES.WORKSHOPMANAGER ? "MANAGER_APPROVED" : "WAITING");

        const newPO = await addPurchaseOrderService(poData);
        const processed = await processPOS3Urls(newPO);
        return res.status(201).json({ success: true, data: processed });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Gets Purchase Orders
 */
const getPurchaseOrders = async (req, res) => {
    try {
        const { role } = req.user;
        let baseQuery = {};

        if (role === ROLES.BRANCHMANAGER) baseQuery.branch = req.user.branchId;
        else if ([ROLES.OPERATIONSTAFF, ROLES.FINANCESTAFF, ROLES.WORKSHOPSTAFF].includes(role)) baseQuery.createdBy = req.user.id;
        else if (role === ROLES.COUNTRYMANAGER) {
            const branches = await Branch.find({ country: { $regex: new RegExp(`^${req.user.country}$`, "i") }, isDeleted: false }).select("_id");
            baseQuery.$or = [{ branch: { $in: branches.map(b => b._id) } }, { createdBy: req.user.id }];
        }

        const result = await getPurchaseOrdersService(req.query, { baseQuery });
        const processedData = await Promise.all(result.data.map(po => processPOS3Urls(po)));

        return res.status(200).json({
            success: true,
            data: processedData,
            pagination: { total: result.total, page: result.page, limit: result.limit, totalPages: result.totalPages }
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
        if (!po) return res.status(404).json({ success: false, message: "PO not found" });
        const processed = await processPOS3Urls(po);
        return res.status(200).json({ success: true, data: processed });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

const approvePurchaseOrder = async (req, res) => {
    try {
        const currentPO = await getPurchaseOrderByIdService(req.params.id);
        if (!currentPO) return res.status(404).json({ success: false, message: "PO not found." });

        const threshold = (await getSetting("poApprovalThreshold")) || 1000;
        if (currentPO.totalAmount > threshold && req.user.role !== ROLES.ADMIN) {
            return res.status(403).json({ success: false, message: `PO over $${threshold} needs ADMIN.` });
        }

        const updatedPO = await updatePurchaseOrderStatusService(req.params.id, req.body.status, req.user.id, req.user.role, { supplier: req.body.supplier });
        const processed = await processPOS3Urls(updatedPO);
        return res.status(200).json({ success: true, data: processed });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

const editPurchaseOrder = async (req, res) => {
    try {
        const currentPO = await getPurchaseOrderByIdService(req.params.id);
        if (!currentPO) return res.status(404).json({ success: false, message: "PO not found" });

        const updatedPO = await updatePurchaseOrderService(req.params.id, { $set: { ...req.body, status: "WAITING" } });
        const processed = await processPOS3Urls(updatedPO);
        return res.status(200).json({ success: true, data: processed });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

const uploadPurchaseOrderItemImages = async (req, res) => {
    try {
        const po = await getPurchaseOrderByIdService(req.params.id);
        if (!po) return res.status(404).json({ success: false, message: "PO not found." });

        const item = po.items.find((i) => i._id.toString() === req.params.itemId);
        if (!item) return res.status(404).json({ success: false, message: "Item not found." });

        const files = req.files?.images || req.files;
        const uploadedUrls = [];
        for (const file of (Array.isArray(files) ? files : [files])) {
            const url = await uploadToS3(file, `purchase-orders/${po._id}/items/${item._id}/${Date.now()}_${file.originalname}`);
            uploadedUrls.push(url);
        }

        item.images.push(...uploadedUrls);
        await po.save();

        const signedUrls = await Promise.all(uploadedUrls.map(u => getPresignedUrl(u)));
        return res.status(200).json({ success: true, data: signedUrls });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

const getEligiblePurchaseOrdersForBilling = async (req, res) => {
    try {
        let baseQuery = { status: "APPROVED", isBilled: { $ne: true } };
        const result = await getPurchaseOrdersService(req.query, { baseQuery });
        const processedData = await Promise.all(result.data.map(po => processPOS3Urls(po)));

        return res.status(200).json({
            success: true,
            data: processedData,
            pagination: { total: result.total, page: result.page, limit: result.limit, totalPages: result.totalPages }
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
    getEligiblePurchaseOrdersForBilling,
};
