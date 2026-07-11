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
        data.status = "TASKS";
        data.reportedBy = req.user.id;
        data.reportedByRole = req.user.role;

        // Auto-assign tasks from TaskTemplate for the given work order type
        if (data.workOrderType) {
            try {
                const { TaskTemplate } = require("../../TaskTemplate/Model/TaskTemplateModel");
                const branchId = data.branchId || req.user.branchId;
                const templates = await TaskTemplate.find({
                    workOrderTypes: data.workOrderType,
                    branchId: branchId,
                    isActive: true
                });

                if (templates.length > 0) {
                    if (!data.tasks) data.tasks = [];
                    templates.forEach(t => {
                        data.tasks.push({
                            description: t.name,
                            category: t.category,
                            estimatedHours: t.estimatedHours || 0.5,
                            status: "PENDING",
                            isDoable: false,
                            taskTemplateId: t._id,
                        });
                    });
                    console.log(`[TASK-TEMPLATE] Auto-assigned ${templates.length} tasks from templates for ${data.workOrderType}`);
                }
            } catch (err) {
                console.error("[TASK-TEMPLATE AUTO-ASSIGN ERROR]", err.message);
            }
            data.parts = [];
            data.estimatedPartsCost = 0;
        }

        // Auto-set SLA from priority
        if (data.priority) {
            data.slaDeadline = calculateSlaDeadline(data.priority);
        }

        // Auto-calculate estimated total cost if not manually provided
        if (!data.estimatedTotalCost && data.estimatedLabourHours !== undefined) {
            const { getSetting } = require("../../SystemSettings/Repo/SystemSettingsRepo");
            const labourRate = (await getSetting("hourlyLabourRate")) || 150;
            const partsCost = data.estimatedPartsCost || 0;
            data.estimatedTotalCost = (Number(data.estimatedLabourHours) * labourRate) + partsCost;
        }

        const wo = await WorkOrderRepo.createWorkOrder(data);

        // Auto-save matched/resolved gpsSerialNumber (IMEI) to vehicle if not already present
        if (data.vehicleId && data.gpsSerialNumber) {
            try {
                const VehicleRepo = require("../../Vehicle/Repo/VehicleRepo");
                const vehicle = await VehicleRepo.getVehicleByIdService(data.vehicleId);
                if (vehicle && !vehicle.gpsSerialNumber) {
                    await VehicleRepo.updateVehicleService(data.vehicleId, {
                        gpsSerialNumber: data.gpsSerialNumber
                    });
                    console.log(`[GPS AUTO-SAVE] Saved resolved IMEI ${data.gpsSerialNumber} to vehicle ${data.vehicleId}`);
                }
            } catch (err) {
                console.error("[GPS AUTO-SAVE ERROR] Failed to save IMEI to vehicle:", err.message);
            }
        }

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
        if (req.query.page) filters.page = req.query.page;
        if (req.query.limit) filters.limit = req.query.limit;
        if (req.query.search) filters.search = req.query.search;

        const result = await WorkOrderRepo.getWorkOrders(filters);

        if (filters.page && filters.limit) {
            return res.status(200).json({
                success: true,
                data: result.docs,
                pagination: {
                    total: result.total,
                    page: result.page,
                    limit: result.limit,
                    totalPages: result.totalPages
                }
            });
        }

        return res.status(200).json({ success: true, data: result });
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
        const wo = await updateTask(req.params.id, req.params.taskId, req.body, req.user);
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
        const wo = await removeTask(req.params.id, req.params.taskId, req.user);
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
    const fs = require('fs');
    const path = require('path');
    const logPath = path.join(__dirname, '../../../../debug_labour.log');
    
    const writeLog = (msg) => {
        try {
            fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${msg}\n`);
        } catch (e) {
            console.error('Failed to write to log file:', e);
        }
    };

    try {
        writeLog(`Called for WO: ${req.params.id} | Body: ${JSON.stringify(req.body)}`);
        const { workStartTime, workEndTime } = req.body;
        if (!workStartTime || !workEndTime) {
            writeLog(`ERROR: Missing workStartTime or workEndTime`);
            return res.status(400).json({ success: false, message: "workStartTime and workEndTime are required" });
        }
        const start = new Date(workStartTime);
        const end = new Date(workEndTime);
        if (isNaN(start.getTime()) || isNaN(end.getTime())) {
            writeLog(`ERROR: Invalid date format | start: ${workStartTime} | end: ${workEndTime}`);
            return res.status(400).json({ success: false, message: "Invalid date format for workStartTime or workEndTime" });
        }
        if (end < start) {
            writeLog(`ERROR: End time before start time | start: ${start.toISOString()} | end: ${end.toISOString()}`);
            return res.status(400).json({ success: false, message: "Work end time must be after work start time" });
        }
        const actualLabourHours = Math.round(((end - start) / (3600 * 1000)) * 100) / 100;
        writeLog(`Calculated actualLabourHours: ${actualLabourHours}`);
        
        const wo = await WorkOrderRepo.updateWorkOrder(req.params.id, {
            workStartTime: start,
            workEndTime: end,
            actualLabourHours: actualLabourHours
        });
        writeLog(`Saved WO. actualLabourHours: ${wo?.actualLabourHours} | workStartTime: ${wo?.workStartTime?.toISOString()} | workEndTime: ${wo?.workEndTime?.toISOString()}`);
        return res.status(200).json({ success: true, data: wo });
    } catch (error) {
        writeLog(`EXCEPTION ERROR: ${error.message} | Stack: ${error.stack}`);
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

// ─── Toggle Task Doable (atomic check + part add/remove) ─────────────

const toggleTaskDoableHandler = async (req, res) => {
    try {
        const { id, taskId } = req.params;
        const wo = await WorkOrderRepo.getWorkOrderById(id);
        if (!wo) return res.status(404).json({ success: false, message: "Work order not found." });

        const task = wo.tasks.id(taskId);
        if (!task) return res.status(404).json({ success: false, message: "Task not found." });

        const nextDoable = !task.isDoable;

        if (!task.taskTemplateId) {
            // No template linked — just toggle isDoable
            task.isDoable = nextDoable;
            await wo.save();
            const updated = await WorkOrderRepo.getWorkOrderById(id);
            return res.status(200).json({ success: true, data: updated });
        }

        const { TaskTemplate } = require("../../TaskTemplate/Model/TaskTemplateModel");
        const template = await TaskTemplate.findById(task.taskTemplateId)
            .populate("linkedParts.inventoryPartId", "partName partNumber quantityOnHand quantityReserved unitCost");

        if (!template) {
            // Template was deleted — just toggle
            task.isDoable = nextDoable;
            await wo.save();
            const updated = await WorkOrderRepo.getWorkOrderById(id);
            return res.status(200).json({ success: true, data: updated });
        }

        // Filter linked parts by vehicle make/model
        let applicableParts = template.linkedParts;
        if (wo.vehicleId && typeof wo.vehicleId === 'object') {
            const make = (wo.vehicleId.basicDetails?.make || '').toLowerCase().trim();
            const model = (wo.vehicleId.basicDetails?.model || '').toLowerCase().trim();
            if (make || model) {
                const { Vehicle } = require("../../Vehicle/Model/VehicleModel");
                const dbMakes = await Vehicle.distinct("basicDetails.make").catch(() => []);
                const dbModels = await Vehicle.distinct("basicDetails.model").catch(() => []);

                const knownModels = Array.from(new Set([
                    'carens', 'soluto', 'brv', 'x70', 's07', 'okavango', 'tiggo',
                    ...dbModels.map(m => (m || '').toLowerCase().trim()).filter(m => m.length >= 3)
                ]));
                const knownMakes = Array.from(new Set([
                    'kia', 'honda', 'jetour', 'soueast', 'souest', 'geely', 'chery', 'cherry',
                    ...dbMakes.map(mk => (mk || '').toLowerCase().trim()).filter(mk => mk.length >= 3)
                ]));
                
                applicableParts = applicableParts.filter(lp => {
                    const name = (lp.partName || '').toLowerCase();
                    
                    // 1. Model specificity check:
                    // If the part name contains any known model name, it MUST match the vehicle's model name
                    const mentionsAnyModel = knownModels.some(m => name.includes(m));
                    if (mentionsAnyModel) {
                        if (!model) return false;
                        const specificModelMatch = knownModels.find(m => name.includes(m));
                        if (specificModelMatch && !model.includes(specificModelMatch)) {
                            return false;
                        }
                    }

                    // 2. Make specificity check:
                    // If the part name contains any known brand make, it MUST match the vehicle's make
                    const mentionsAnyMake = knownMakes.some(mk => name.includes(mk));
                    if (mentionsAnyMake) {
                        if (!make) return false;
                        const specificMakeMatch = knownMakes.find(mk => name.includes(mk));
                        
                        let normalizedMake = make;
                        if (make === 'soueast' || make === 'souest') normalizedMake = 'soue';
                        
                        let normalizedPartMake = specificMakeMatch;
                        if (specificMakeMatch === 'soueast' || specificMakeMatch === 'souest') normalizedPartMake = 'soue';
                        
                        if (normalizedPartMake && !normalizedMake.includes(normalizedPartMake) && !normalizedPartMake.includes(normalizedMake)) {
                            return false;
                        }
                    }

                    return true;
                });
            }
        }

        if (nextDoable) {
            // CHECKING — reserve stock & add parts
            const { checkAndReserve } = require("../../Inventory/Service/InventoryService");
            const user = { id: req.user?.id || req.user?._id, role: req.user?.role };
            for (const lp of applicableParts) {
                const qty = lp.defaultQuantity || 1;
                const reserveResult = await checkAndReserve(lp.inventoryPartId?._id || lp.inventoryPartId, qty, user, id);
                if (!reserveResult.success) {
                    return res.status(400).json({
                        success: false,
                        message: reserveResult.message || `Cannot check task: part '${lp.partName}' is out of stock.`
                    });
                }
            }
            // Add parts to WO
            const { InventoryPart } = require("../../Inventory/Model/InventoryPartModel");
            for (const lp of applicableParts) {
                const invPart = await InventoryPart.findById(lp.inventoryPartId?._id || lp.inventoryPartId);
                const qty = lp.defaultQuantity || 1;
                const alreadyExists = wo.parts.some(p =>
                    p.inventoryPartId?.toString() === (lp.inventoryPartId?._id || lp.inventoryPartId).toString()
                );
                if (!alreadyExists) {
                    wo.parts.push({
                        partName: lp.partName,
                        partNumber: lp.partNumber,
                        quantity: qty,
                        unitCost: invPart.unitCost,
                        totalCost: invPart.unitCost * qty,
                        source: "IN_STOCK",
                        inventoryPartId: lp.inventoryPartId?._id || lp.inventoryPartId,
                        taskTemplateId: task.taskTemplateId,
                        status: "RESERVED",
                    });
                }
            }
            task.isDoable = true;
        } else {
            // UNCHECKING — release reservation & remove auto-added parts
            const { releaseReservation } = require("../../Inventory/Service/InventoryService");
            const user = { id: req.user?.id || req.user?._id, role: req.user?.role };
            for (const lp of applicableParts) {
                const qty = lp.defaultQuantity || 1;
                const partIdStr = (lp.inventoryPartId?._id || lp.inventoryPartId).toString();
                const wasAdded = wo.parts.some(p => 
                    p.inventoryPartId?.toString() === partIdStr && 
                    p.taskTemplateId?.toString() === task.taskTemplateId?.toString()
                );
                if (wasAdded) {
                    try {
                        await releaseReservation(lp.inventoryPartId?._id || lp.inventoryPartId, qty, user, id);
                    } catch (err) {
                        console.error(`Failed to release reservation for part ${lp.partName}:`, err);
                    }
                }
            }

            const partsToRemoveIds = applicableParts.map(lp => (lp.inventoryPartId?._id || lp.inventoryPartId).toString());
            wo.parts = wo.parts.filter(p => {
                const matchesTemplate = p.taskTemplateId && p.taskTemplateId.toString() === task.taskTemplateId.toString();
                const matchesPartId = p.inventoryPartId && partsToRemoveIds.includes(p.inventoryPartId.toString());
                return !(matchesTemplate || matchesPartId);
            });
            task.isDoable = false;
        }

        await wo.save();
        const updated = await WorkOrderRepo.getWorkOrderById(id);
        return res.status(200).json({ success: true, data: updated });
    } catch (error) {
        const statusCode = error.cause || 500;
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
    toggleTaskDoableHandler,
};

