console.log("[DEBUG] Loading WorkOrderController.js...");
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
const crypto = require("crypto");

/**
 * Create a new Work Order (DRAFT).
 * @route POST /api/work-orders
 */
const createWorkOrderHandler = async (req, res) => {
    try {
        const data = req.body;
        data.createdBy = req.user.id;
        data.creatorRole = req.user.role;
        data.status = "DRAFT";
        data.reportedBy = req.user.id;
        data.reportedByRole = req.user.role;

        // Auto-set SLA from priority
        if (data.priority) {
            data.slaDeadline = calculateSlaDeadline(data.priority);
        }

        // Auto-calculate estimated total cost if not manually provided
        if (!data.estimatedTotalCost && data.estimatedLabourHours && data.estimatedPartsCost) {
            const labourRate = 50; // default hourly rate — can be made configurable
            data.estimatedTotalCost = (data.estimatedLabourHours * labourRate) + data.estimatedPartsCost;
        }

        const wo = await WorkOrderRepo.createWorkOrder(data);

        return res.status(201).json({ success: true, data: wo });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Get all Work Orders with optional filters.
 * @route GET /api/work-orders
 */
const getWorkOrdersHandler = async (req, res) => {
    try {
        const filters = {};
        if (req.query.status) filters.status = req.query.status;
        if (req.query.branchId) filters.branchId = req.query.branchId;
        if (req.query.vehicleId) filters.vehicleId = req.query.vehicleId;
        if (req.query.priority) filters.priority = req.query.priority;
        if (req.query.workOrderType) filters.workOrderType = req.query.workOrderType;

        const workOrders = await WorkOrderRepo.getWorkOrders(filters);
        return res.status(200).json({ success: true, data: workOrders });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Get a single Work Order by ID.
 * @route GET /api/work-orders/:id
 */
const getWorkOrderByIdHandler = async (req, res) => {
    try {
        const wo = await WorkOrderRepo.getWorkOrderById(req.params.id);
        if (!wo) {
            return res.status(404).json({ success: false, message: "Work order not found" });
        }
        return res.status(200).json({ success: true, data: wo });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Progress Work Order through the workflow state machine.
 * @route PUT /api/work-orders/:id/progress
 */
const progressWorkOrderStatusHandler = async (req, res) => {
    try {
        const woId = req.params.id;
        const { targetStatus, updateData, notes } = req.body;
        const user = req.user;

        const payload = { ...updateData };
        if (notes) payload.notes = notes;

        const updatedWO = await processWorkOrderProgress(woId, targetStatus, payload, user);

        return res.status(200).json({ success: true, data: updatedWO });
    } catch (error) {
        const statusCode = error.cause || 500;
        return res.status(statusCode).json({ success: false, message: error.message });
    }
};

// ─── Task Handlers ───────────────────────────────────────────────────

/**
 * Add a task to a work order.
 * @route POST /api/work-orders/:id/tasks
 */
const addTaskHandler = async (req, res) => {
    try {
        const wo = await addTask(req.params.id, req.body);
        return res.status(201).json({ success: true, data: wo });
    } catch (error) {
        const statusCode = error.cause || 500;
        return res.status(statusCode).json({ success: false, message: error.message });
    }
};

/**
 * Update a task within a work order.
 * @route PUT /api/work-orders/:id/tasks/:taskId
 */
const updateTaskHandler = async (req, res) => {
    try {
        const wo = await updateTask(req.params.id, req.params.taskId, req.body);
        return res.status(200).json({ success: true, data: wo });
    } catch (error) {
        const statusCode = error.cause || 500;
        return res.status(statusCode).json({ success: false, message: error.message });
    }
};

/**
 * Remove a task from a work order (only PENDING).
 * @route DELETE /api/work-orders/:id/tasks/:taskId
 */
const removeTaskHandler = async (req, res) => {
    try {
        const wo = await removeTask(req.params.id, req.params.taskId);
        return res.status(200).json({ success: true, data: wo });
    } catch (error) {
        const statusCode = error.cause || 500;
        return res.status(statusCode).json({ success: false, message: error.message });
    }
};

// ─── Part Handlers ───────────────────────────────────────────────────

/**
 * Add a part to a work order.
 * @route POST /api/work-orders/:id/parts
 */
const addPartHandler = async (req, res) => {
    try {
        const wo = await addPart(req.params.id, req.body, req.user);
        return res.status(201).json({ success: true, data: wo });
    } catch (error) {
        const statusCode = error.cause || 500;
        return res.status(statusCode).json({ success: false, message: error.message });
    }
};

/**
 * Update a part within a work order.
 * @route PUT /api/work-orders/:id/parts/:partId
 */
const updatePartHandler = async (req, res) => {
    try {
        const wo = await updatePart(req.params.id, req.params.partId, req.body, req.user);
        return res.status(200).json({ success: true, data: wo });
    } catch (error) {
        const statusCode = error.cause || 500;
        return res.status(statusCode).json({ success: false, message: error.message });
    }
};

/**
 * Remove a part from a work order (only REQUESTED).
 * @route DELETE /api/work-orders/:id/parts/:partId
 */
const removePartHandler = async (req, res) => {
    try {
        const wo = await removePart(req.params.id, req.params.partId, req.user);
        return res.status(200).json({ success: true, data: wo });
    } catch (error) {
        const statusCode = error.cause || 500;
        return res.status(statusCode).json({ success: false, message: error.message });
    }
};

// ─── Labour Handlers ─────────────────────────────────────────────────

/**
 * Log a labour entry (CLOCK_IN, CLOCK_OUT, PAUSE, RESUME).
 * @route POST /api/work-orders/:id/labour
 */
const logLabourHandler = async (req, res) => {
    try {
        const entry = req.body;
        if (!entry.technicianId) {
            entry.technicianId = req.user.id;
        }
        const wo = await logLabourEntry(req.params.id, entry);
        return res.status(201).json({ success: true, data: wo });
    } catch (error) {
        const statusCode = error.cause || 500;
        return res.status(statusCode).json({ success: false, message: error.message });
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

// ─── QC Handlers ─────────────────────────────────────────────────────

/**
 * Auto-generate QC checklist based on work order type.
 * @route POST /api/work-orders/:id/qc/generate
 */
const generateQcHandler = async (req, res) => {
    try {
        const wo = await generateQcChecklist(req.params.id);
        return res.status(201).json({ success: true, data: wo.qcChecklist });
    } catch (error) {
        const statusCode = error.cause || 500;
        return res.status(statusCode).json({ success: false, message: error.message });
    }
};

/**
 * Submit QC results.
 * @route PUT /api/work-orders/:id/qc/submit
 */
const submitQcHandler = async (req, res) => {
    try {
        const { results } = req.body;
        if (!results || !Array.isArray(results)) {
            return res.status(400).json({ success: false, message: "results array is required" });
        }
        const outcome = await submitQcResults(req.params.id, results, req.user);
        return res.status(200).json({ success: true, data: outcome });
    } catch (error) {
        const statusCode = error.cause || 500;
        return res.status(statusCode).json({ success: false, message: error.message });
    }
};

// ─── Photo Handlers ──────────────────────────────────────────────────

/**
 * Add a photo to a work order.
 * @route POST /api/work-orders/:id/photos
 */
const addPhotoHandler = async (req, res) => {
    try {
        // Detailed debug logging
        console.log("─── PHOTO UPLOAD DEBUG START ───");
        console.log("Headers:", req.headers["content-type"]);
        console.log("Params ID:", req.params.id);
        console.log("Body Fields:", Object.keys(req.body || {}));
        console.log("File Exists:", !!req.file);
        if (req.file) {
            console.log("File Info:", {
                fieldname: req.file.fieldname,
                originalname: req.file.originalname,
                mimetype: req.file.mimetype,
                size: req.file.size
            });
        }
        console.log("─── PHOTO UPLOAD DEBUG END ───");

        const body = req.body || {};
        let photoUrl = body.url;

        // If file is uploaded via multipart/form-data
        if (req.file) {
            const ext = req.file.originalname.split(".").pop();
            const filename = crypto.randomBytes(16).toString("hex") + "." + ext;
            const key = `work-orders/${req.params.id}/photos/${filename}`;
            const uploadedKey = await uploadToS3(req.file, key);

            // Build S3 URL
            const bucket = process.env.AWS_BUCKET_NAME;
            const region = process.env.AWS_REGION;
            photoUrl = `https://${bucket}.s3.${region}.amazonaws.com/${uploadedKey}`;
        }

        if (!photoUrl) {
            return res.status(400).json({
                success: false,
                message: "Photo file or URL is required. (Check if 'photo' field is sent in FormData)"
            });
        }

        const photoData = {
            url: photoUrl,
            caption: body.caption || "",
            stage: body.stage || "IN_PROGRESS",
            uploadedBy: req.user.id,
        };
        const wo = await addWorkOrderPhoto(req.params.id, photoData);
        return res.status(201).json({ success: true, data: wo.photos });
    } catch (error) {
        const statusCode = error.cause || 500;
        return res.status(statusCode).json({ success: false, message: error.message });
    }
};

/**
 * Upload a photo file to S3 and add to work order.
 * @route POST /api/work-orders/:id/photos/upload
 * @param {file} photo - Multer file object
 */
const uploadWorkOrderPhotoHandler = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: "No photo file uploaded" });
        }

        const woId = req.params.id;
        const file = req.file;
        const caption = req.body.caption || "";
        const stage = req.body.stage || "IN_PROGRESS";

        // Upload to S3 (Folder: work-orders/{woId})
        const s3Url = await uploadToS3(file, `work-orders/${woId}`);

        const photoData = {
            url: s3Url,
            caption,
            stage,
            uploadedBy: req.user.id,
        };

        const wo = await addWorkOrderPhoto(woId, photoData);
        return res.status(201).json({ success: true, data: wo.photos });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Remove a photo from a work order.
 * @route DELETE /api/work-orders/:id/photos/:photoId
 */
const removePhotoHandler = async (req, res) => {
    try {
        const { id, photoId } = req.params;
        const wo = await removeWorkOrderPhoto(id, photoId);
        return res.status(200).json({ success: true, data: wo.photos });
    } catch (error) {
        const statusCode = error.cause || 500;
        return res.status(statusCode).json({ success: false, message: error.message });
    }
};

// ─── Vehicle Release Handler ─────────────────────────────────────────

/**
 * Release vehicle from workshop.
 * @route PUT /api/work-orders/:id/release
 */
const releaseVehicleHandler = async (req, res) => {
    try {
        const wo = await executeVehicleRelease(req.params.id, req.body, req.user);
        return res.status(200).json({ success: true, data: wo });
    } catch (error) {
        const statusCode = error.cause || 500;
        return res.status(statusCode).json({ success: false, message: error.message });
    }
};

/**
 * Generate a service bill for a work order.
 * @route POST /api/work-orders/:id/billing/generate
 */
const generateBillHandler = async (req, res) => {
    try {
        const bill = await generateFromWorkOrder(req.params.id, req.body, req.user);
        
        // Link bill to WO
        await WorkOrderRepo.updateWorkOrder(req.params.id, { serviceBillId: bill._id });
        
        return res.status(201).json({ success: true, data: bill });
    } catch (error) {
        console.error(`[BILLING ERROR] ${error.message}`);
        const statusCode = error.statusCode || error.cause || 500;
        return res.status(statusCode).json({ success: false, message: error.message });
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

