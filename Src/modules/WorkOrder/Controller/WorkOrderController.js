const WorkOrderRepo = require("../Repo/WorkOrderRepo");
const { processWorkOrderProgress, calculateSlaDeadline } = require("../Service/WorkOrderWorkflowService");
const {
    addTask,
    updateTask,
    removeTask,
    addPart,
    updatePart,
    removePart,
    logLabourEntry,
} = require("../Service/WorkOrderService");
const uploadToS3 = require("../../../utils/uploadToS3");
const getPresignedUrl = require("../../../utils/getPresignedUrl");
const crypto = require("crypto");

/**
 * Helper to process all S3 URLs in a work order object.
 */
const processWorkOrderS3Urls = async (wo) => {
    if (!wo) return null;
    const obj = typeof wo.toObject === 'function' ? wo.toObject() : wo;

    // Work Order Photos
    if (obj.photos && Array.isArray(obj.photos)) {
        obj.photos = await Promise.all(obj.photos.map(async (photo) => {
            if (photo.url) photo.url = await getPresignedUrl(photo.url);
            return photo;
        }));
    }

    return obj;
};

/**
 * Create a new Work Order (DRAFT).
 */
const createWorkOrderHandler = async (req, res) => {
    try {
        const data = req.body;
        data.createdBy = data.reportedBy = req.user.id;
        data.creatorRole = data.reportedByRole = req.user.role;
        data.status = "DRAFT";

        if (data.priority) data.slaDeadline = calculateSlaDeadline(data.priority);
        if (!data.estimatedTotalCost && data.estimatedLabourHours && data.estimatedPartsCost) {
            data.estimatedTotalCost = (data.estimatedLabourHours * 50) + data.estimatedPartsCost;
        }

        const wo = await WorkOrderRepo.createWorkOrder(data);
        return res.status(201).json({ success: true, data: wo });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Get all Work Orders
 */
const getWorkOrdersHandler = async (req, res) => {
    try {
        const filters = { ...req.query };
        const workOrders = await WorkOrderRepo.getWorkOrders(filters);
        const processed = await Promise.all(workOrders.map(wo => processWorkOrderS3Urls(wo)));
        return res.status(200).json({ success: true, data: processed });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Get a single Work Order
 */
const getWorkOrderByIdHandler = async (req, res) => {
    try {
        const wo = await WorkOrderRepo.getWorkOrderById(req.params.id);
        if (!wo) return res.status(404).json({ success: false, message: "Work order not found" });
        const processed = await processWorkOrderS3Urls(wo);
        return res.status(200).json({ success: true, data: processed });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Progress Work Order status
 */
const progressWorkOrderStatusHandler = async (req, res) => {
    try {
        const payload = { ...req.body.updateData, notes: req.body.notes };
        const updatedWO = await processWorkOrderProgress(req.params.id, req.body.targetStatus, payload, req.user);
        const processed = await processWorkOrderS3Urls(updatedWO);
        return res.status(200).json({ success: true, data: processed });
    } catch (error) {
        return res.status(error.cause || 500).json({ success: false, message: error.message });
    }
};

// ─── Task Handlers ───────────────────────────────────────────────────
const addTaskHandler = async (req, res) => {
    try {
        const wo = await addTask(req.params.id, req.body);
        return res.status(201).json({ success: true, data: wo });
    } catch (error) {
        return res.status(error.cause || 500).json({ success: false, message: error.message });
    }
};

const updateTaskHandler = async (req, res) => {
    try {
        const wo = await updateTask(req.params.id, req.params.taskId, req.body);
        return res.status(200).json({ success: true, data: wo });
    } catch (error) {
        return res.status(error.cause || 500).json({ success: false, message: error.message });
    }
};

const removeTaskHandler = async (req, res) => {
    try {
        const wo = await removeTask(req.params.id, req.params.taskId);
        return res.status(200).json({ success: true, data: wo });
    } catch (error) {
        return res.status(error.cause || 500).json({ success: false, message: error.message });
    }
};

// ─── Part Handlers ───────────────────────────────────────────────────
const addPartHandler = async (req, res) => {
    try {
        const wo = await addPart(req.params.id, req.body, req.user);
        return res.status(201).json({ success: true, data: wo });
    } catch (error) {
        return res.status(error.cause || 500).json({ success: false, message: error.message });
    }
};

const updatePartHandler = async (req, res) => {
    try {
        const wo = await updatePart(req.params.id, req.params.partId, req.body, req.user);
        return res.status(200).json({ success: true, data: wo });
    } catch (error) {
        return res.status(error.cause || 500).json({ success: false, message: error.message });
    }
};

const removePartHandler = async (req, res) => {
    try {
        const wo = await removePart(req.params.id, req.params.partId, req.user);
        return res.status(200).json({ success: true, data: wo });
    } catch (error) {
        return res.status(error.cause || 500).json({ success: false, message: error.message });
    }
};

const logLabourHandler = async (req, res) => {
    try {
        const entry = req.body;
        if (!entry.technicianId) entry.technicianId = req.user.id;
        const wo = await logLabourEntry(req.params.id, entry);
        return res.status(201).json({ success: true, data: wo });
    } catch (error) {
        return res.status(error.cause || 500).json({ success: false, message: error.message });
    }
};

const {
    generateQcChecklist,
    submitQcResults,
    addWorkOrderPhoto,
    removeWorkOrderPhoto,
    executeVehicleRelease,
} = require("../Service/QcReleaseService");
const { generateFromWorkOrder } = require("../../ServiceBill/Service/ServiceBillService");

const generateQcHandler = async (req, res) => {
    try {
        const wo = await generateQcChecklist(req.params.id);
        return res.status(201).json({ success: true, data: wo.qcChecklist });
    } catch (error) {
        return res.status(error.cause || 500).json({ success: false, message: error.message });
    }
};

const submitQcHandler = async (req, res) => {
    try {
        const outcome = await submitQcResults(req.params.id, req.body.results, req.user);
        return res.status(200).json({ success: true, data: outcome });
    } catch (error) {
        return res.status(error.cause || 500).json({ success: false, message: error.message });
    }
};

/**
 * Add a photo to a work order.
 */
const addPhotoHandler = async (req, res) => {
    try {
        let photoUrl = req.body.url;
        if (req.file) {
            const ext = req.file.originalname.split(".").pop();
            const filename = crypto.randomBytes(16).toString("hex") + "." + ext;
            const key = `work-orders/${req.params.id}/photos/${filename}`;
            photoUrl = await uploadToS3(req.file, key);
        }

        if (!photoUrl) return res.status(400).json({ success: false, message: "Photo file or URL required." });

        const photoData = { url: photoUrl, caption: req.body.caption || "", stage: req.body.stage || "IN_PROGRESS", uploadedBy: req.user.id };
        const wo = await addWorkOrderPhoto(req.params.id, photoData);
        
        // Sign the URLs for the response
        const processedWO = await processWorkOrderS3Urls(wo);
        return res.status(201).json({ success: true, data: processedWO.photos });
    } catch (error) {
        return res.status(error.cause || 500).json({ success: false, message: error.message });
    }
};

/**
 * Upload a photo file and add to work order.
 */
const uploadWorkOrderPhotoHandler = async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ success: false, message: "No photo file uploaded" });

        const s3Url = await uploadToS3(req.file, `work-orders/${req.params.id}`);
        const photoData = { url: s3Url, caption: req.body.caption || "", stage: req.body.stage || "IN_PROGRESS", uploadedBy: req.user.id };
        const wo = await addWorkOrderPhoto(req.params.id, photoData);
        
        const processedWO = await processWorkOrderS3Urls(wo);
        return res.status(201).json({ success: true, data: processedWO.photos });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

const removePhotoHandler = async (req, res) => {
    try {
        const wo = await removeWorkOrderPhoto(req.params.id, req.params.photoId);
        return res.status(200).json({ success: true, data: wo.photos });
    } catch (error) {
        return res.status(error.cause || 500).json({ success: false, message: error.message });
    }
};

const releaseVehicleHandler = async (req, res) => {
    try {
        const wo = await executeVehicleRelease(req.params.id, req.body, req.user);
        return res.status(200).json({ success: true, data: wo });
    } catch (error) {
        return res.status(error.cause || 500).json({ success: false, message: error.message });
    }
};

const generateBillHandler = async (req, res) => {
    try {
        const bill = await generateFromWorkOrder(req.params.id, req.body, req.user);
        await WorkOrderRepo.updateWorkOrder(req.params.id, { serviceBillId: bill._id });
        return res.status(201).json({ success: true, data: bill });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = {
    createWorkOrderHandler,
    getWorkOrdersHandler,
    getWorkOrderByIdHandler,
    progressWorkOrderStatusHandler,
    addTaskHandler,
    updateTaskHandler,
    removeTaskHandler,
    addPartHandler,
    updatePartHandler,
    removePartHandler,
    logLabourHandler,
    generateQcHandler,
    submitQcHandler,
    addPhotoHandler,
    uploadWorkOrderPhotoHandler,
    removePhotoHandler,
    generateBillHandler,
    releaseVehicleHandler,
};
