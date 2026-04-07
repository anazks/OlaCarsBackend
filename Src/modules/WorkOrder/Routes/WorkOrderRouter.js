const express = require("express");
const router = express.Router();

const { authenticate } = require("../../../shared/middlewares/authMiddleware.js");
const { authorize } = require("../../../shared/middlewares/roleMiddleWare.js");
const { ROLES } = require("../../../shared/constants/roles.js");

const {
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
} = require("../Controller/WorkOrderController");

// PRIORITY ROUTES (Specific paths first)
router.post(
    "/:id/billing/generate",
    authenticate,
    authorize(ROLES.WORKSHOPSTAFF, ROLES.OPERATIONSTAFF, ROLES.BRANCHMANAGER, ROLES.ADMIN, ROLES.WORKSHOPMANAGER),
    generateBillHandler
);

const upload = require("../../../utils/multerConfig.js");

/**
 * @swagger
 * tags:
 *   name: WorkOrder
 *   description: Workshop Work Order Management APIs
 */

/**
 * @swagger
 * /api/work-orders:
 *   post:
 *     summary: Create a new work order (DRAFT)
 *     tags: [WorkOrder]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - workOrderType
 *               - vehicleId
 *               - branchId
 *               - faultDescription
 *             properties:
 *               workOrderType:
 *                 type: string
 *                 enum: [PREVENTIVE, CORRECTIVE, PRE_ENTRY, ACCIDENT, RETURN_INSPECTION, RECALL, SAFETY_PREP, WEAR_ITEM]
 *               vehicleId:
 *                 type: string
 *                 description: Vehicle ObjectId
 *               branchId:
 *                 type: string
 *                 description: Branch ObjectId
 *               priority:
 *                 type: string
 *                 enum: [LOW, MEDIUM, HIGH, CRITICAL]
 *                 default: MEDIUM
 *               faultDescription:
 *                 type: string
 *               assignedTechnician:
 *                 type: string
 *                 description: WorkshopStaff ObjectId
 *               estimatedLabourHours:
 *                 type: number
 *               estimatedPartsCost:
 *                 type: number
 *               estimatedTotalCost:
 *                 type: number
 *               notes:
 *                 type: string
 *     responses:
 *       201:
 *         description: Work order created in DRAFT status
 *       500:
 *         description: Server error
 */
router.post(
    "/",
    authenticate,
    authorize(
        ROLES.WORKSHOPSTAFF,
        ROLES.OPERATIONSTAFF,
        ROLES.BRANCHMANAGER,
        ROLES.COUNTRYMANAGER,
        ROLES.ADMIN,
        ROLES.WORKSHOPMANAGER
    ),
    createWorkOrderHandler
);

/**
 * @swagger
 * /api/work-orders:
 *   get:
 *     summary: Get all work orders (supports filtering)
 *     tags: [WorkOrder]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *         description: Filter by status
 *       - in: query
 *         name: branchId
 *         schema:
 *           type: string
 *         description: Filter by branch
 *       - in: query
 *         name: vehicleId
 *         schema:
 *           type: string
 *         description: Filter by vehicle
 *       - in: query
 *         name: priority
 *         schema:
 *           type: string
 *           enum: [LOW, MEDIUM, HIGH, CRITICAL]
 *         description: Filter by priority
 *       - in: query
 *         name: workOrderType
 *         schema:
 *           type: string
 *         description: Filter by work order type
 *     responses:
 *       200:
 *         description: List of work orders
 */
router.get(
    "/",
    authenticate,
    getWorkOrdersHandler
);

/**
 * @swagger
 * /api/work-orders/{id}:
 *   get:
 *     summary: Get a single work order by ID
 *     tags: [WorkOrder]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
      200:
        description: Work order details
      404:
        description: Work order not found
*/

router.get(
    "/:id",
    authenticate,
    getWorkOrderByIdHandler
);

/**
 * @swagger
 * /api/work-orders/{id}/progress:
 *   put:
 *     summary: Progress work order through the workflow state machine
 *     tags: [WorkOrder]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - targetStatus
 *             properties:
 *               targetStatus:
 *                 type: string
 *                 enum: [DRAFT, PENDING_APPROVAL, START, REJECTED, VEHICLE_CHECKED_IN, PARTS_REQUESTED, PARTS_RECEIVED, IN_PROGRESS, PAUSED, ADDITIONAL_WORK_FOUND, QUALITY_CHECK, FAILED_QC, READY_FOR_RELEASE, VEHICLE_RELEASED, INVOICED, CLOSED, CANCELLED]
 *               notes:
 *                 type: string
 *               updateData:
 *                 type: object
 *     responses:
 *       200:
 *         description: Work order status updated
 *       400:
 *         description: Invalid transition or gate validation failed
 *       403:
 *         description: Role not authorized
 *       404:
 *         description: Work order not found
 */
router.put(
    "/:id/progress",
    authenticate,
    authorize(
        ROLES.WORKSHOPSTAFF,
        ROLES.OPERATIONSTAFF,
        ROLES.FINANCESTAFF,
        ROLES.BRANCHMANAGER,
        ROLES.COUNTRYMANAGER,
        ROLES.FINANCEADMIN,
        ROLES.ADMIN,
        ROLES.WORKSHOPMANAGER
    ),
    progressWorkOrderStatusHandler
);

// ═══════════════════════════════════════════════════════════════════════
//  TASK MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════

/**
 * @swagger
 * /api/work-orders/{id}/tasks:
 *   post:
 *     summary: Add a task to a work order
 *     tags: [WorkOrder]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - description
 *             properties:
 *               description:
 *                 type: string
 *               category:
 *                 type: string
 *                 enum: [Mechanical, Electrical, Body, Tyres, Fluids, Other]
 *               assignedTo:
 *                 type: string
 *               estimatedHours:
 *                 type: number
 *               notes:
 *                 type: string
 *     responses:
 *       201:
 *         description: Task added
 */
router.post(
    "/:id/tasks",
    authenticate,
    authorize(ROLES.WORKSHOPSTAFF, ROLES.OPERATIONSTAFF, ROLES.BRANCHMANAGER, ROLES.ADMIN, ROLES.WORKSHOPMANAGER),
    addTaskHandler
);

/**
 * @swagger
 * /api/work-orders/{id}/tasks/{taskId}:
 *   put:
 *     summary: Update a task within a work order
 *     tags: [WorkOrder]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: taskId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [PENDING, IN_PROGRESS, COMPLETED, SKIPPED]
 *               actualHours:
 *                 type: number
 *               notes:
 *                 type: string
 *               assignedTo:
 *                 type: string
 *     responses:
 *       200:
 *         description: Task updated
 */
router.put(
    "/:id/tasks/:taskId",
    authenticate,
    authorize(ROLES.WORKSHOPSTAFF, ROLES.OPERATIONSTAFF, ROLES.BRANCHMANAGER, ROLES.ADMIN, ROLES.WORKSHOPMANAGER),
    updateTaskHandler
);

/**
 * @swagger
 * /api/work-orders/{id}/tasks/{taskId}:
 *   delete:
 *     summary: Remove a PENDING task from a work order
 *     tags: [WorkOrder]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: taskId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Task removed
 */
router.delete(
    "/:id/tasks/:taskId",
    authenticate,
    authorize(ROLES.WORKSHOPSTAFF, ROLES.OPERATIONSTAFF, ROLES.BRANCHMANAGER, ROLES.ADMIN, ROLES.WORKSHOPMANAGER),
    removeTaskHandler
);

// ═══════════════════════════════════════════════════════════════════════
//  PARTS MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════

/**
 * @swagger
 * /api/work-orders/{id}/parts:
 *   post:
 *     summary: Add a part to a work order
 *     tags: [WorkOrder]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - partName
 *               - quantity
 *             properties:
 *               partName:
 *                 type: string
 *               partNumber:
 *                 type: string
 *               quantity:
 *                 type: number
 *                 minimum: 1
 *               unitCost:
 *                 type: number
 *               source:
 *                 type: string
 *                 enum: [IN_STOCK, ORDERED, EXTERNAL_VENDOR]
 *     responses:
 *       201:
 *         description: Part added
 */
router.post(
    "/:id/parts",
    authenticate,
    authorize(ROLES.WORKSHOPSTAFF, ROLES.OPERATIONSTAFF, ROLES.BRANCHMANAGER, ROLES.ADMIN, ROLES.WORKSHOPMANAGER),
    addPartHandler
);

/**
 * @swagger
 * /api/work-orders/{id}/parts/{partId}:
 *   put:
 *     summary: Update a part within a work order
 *     tags: [WorkOrder]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: partId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [REQUESTED, RESERVED, RECEIVED, INSTALLED, RETURNED]
 *               quantity:
 *                 type: number
 *               unitCost:
 *                 type: number
 *               receivedDate:
 *                 type: string
 *                 format: date-time
 *               installedBy:
 *                 type: string
 *               source:
 *                 type: string
 *                 enum: [IN_STOCK, ORDERED, EXTERNAL_VENDOR]
 *     responses:
 *       200:
 *         description: Part updated
 */
router.put(
    "/:id/parts/:partId",
    authenticate,
    authorize(ROLES.WORKSHOPSTAFF, ROLES.OPERATIONSTAFF, ROLES.BRANCHMANAGER, ROLES.ADMIN, ROLES.WORKSHOPMANAGER),
    updatePartHandler
);

/**
 * @swagger
 * /api/work-orders/{id}/parts/{partId}:
 *   delete:
 *     summary: Remove a REQUESTED part from a work order
 *     tags: [WorkOrder]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: partId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Part removed
 */
router.delete(
    "/:id/parts/:partId",
    authenticate,
    authorize(ROLES.WORKSHOPSTAFF, ROLES.OPERATIONSTAFF, ROLES.BRANCHMANAGER, ROLES.ADMIN, ROLES.WORKSHOPMANAGER),
    removePartHandler
);

// ═══════════════════════════════════════════════════════════════════════
//  LABOUR TRACKING
// ═══════════════════════════════════════════════════════════════════════

/**
 * @swagger
 * /api/work-orders/{id}/labour:
 *   post:
 *     summary: Log a labour entry (CLOCK_IN, CLOCK_OUT, PAUSE, RESUME)
 *     description: |
 *       Tracks technician time. Actions must follow the sequence:
 *       CLOCK_IN → (PAUSE → RESUME)* → CLOCK_OUT.
 *       Actual labour hours are auto-calculated on CLOCK_OUT.
 *     tags: [WorkOrder]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - action
 *             properties:
 *               technicianId:
 *                 type: string
 *                 description: WorkshopStaff ObjectId (defaults to current user)
 *               action:
 *                 type: string
 *                 enum: [CLOCK_IN, CLOCK_OUT, PAUSE, RESUME]
 *               taskReference:
 *                 type: string
 *               notes:
 *                 type: string
 *     responses:
 *       201:
 *         description: Labour entry logged
 *       400:
 *         description: Invalid action sequence
 */
router.post(
    "/:id/labour",
    authenticate,
    authorize(ROLES.WORKSHOPSTAFF, ROLES.OPERATIONSTAFF, ROLES.BRANCHMANAGER, ROLES.ADMIN, ROLES.WORKSHOPMANAGER),
    logLabourHandler
);

// ═══════════════════════════════════════════════════════════════════════
//  QC (QUALITY CHECK)
// ═══════════════════════════════════════════════════════════════════════

/**
 * @swagger
 * /api/work-orders/{id}/qc/generate:
 *   post:
 *     summary: Auto-generate QC checklist based on work order type
 *     tags: [WorkOrder]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       201:
 *         description: QC checklist generated
 */
router.post(
    "/:id/qc/generate",
    authenticate,
    authorize(ROLES.WORKSHOPSTAFF, ROLES.OPERATIONSTAFF, ROLES.BRANCHMANAGER, ROLES.ADMIN, ROLES.WORKSHOPMANAGER),
    generateQcHandler
);

/**
 * @swagger
 * /api/work-orders/{id}/qc/submit:
 *   put:
 *     summary: Submit QC inspection results
 *     tags: [WorkOrder]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - results
 *             properties:
 *               results:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     checkItem:
 *                       type: string
 *                     result:
 *                       type: string
 *                       enum: [PASS, FAIL, NA]
 *                     notes:
 *                       type: string
 *     responses:
 *       200:
 *         description: QC results submitted
 */
router.put(
    "/:id/qc/submit",
    authenticate,
    authorize(ROLES.WORKSHOPSTAFF, ROLES.OPERATIONSTAFF, ROLES.BRANCHMANAGER, ROLES.ADMIN, ROLES.WORKSHOPMANAGER),
    submitQcHandler
);

// ═══════════════════════════════════════════════════════════════════════
//  PHOTOS
// ═══════════════════════════════════════════════════════════════════════

/**
 * @swagger
 * /api/work-orders/{id}/photos:
 *   post:
 *     summary: Add a photo to a work order
 *     tags: [WorkOrder]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - url
 *             properties:
 *               url:
 *                 type: string
 *                 description: S3 URL or file path
 *               caption:
 *                 type: string
 *               stage:
 *                 type: string
 *                 enum: [CHECK_IN, IN_PROGRESS, QC, RELEASE]
 *     responses:
 *       201:
 *         description: Photo added
 */
router.post(
    "/:id/photos",
    authenticate,
    authorize(ROLES.WORKSHOPSTAFF, ROLES.OPERATIONSTAFF, ROLES.BRANCHMANAGER, ROLES.ADMIN, ROLES.WORKSHOPMANAGER),
    addPhotoHandler
);

/**
 * @swagger
 * /api/work-orders/{id}/photos/upload:
 *   post:
 *     summary: Upload a photo file to a work order (multipart/form-data)
 *     tags: [WorkOrder]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               photo:
 *                 type: string
 *                 format: binary
 *               caption:
 *                 type: string
 *               stage:
 *                 type: string
 *                 enum: [CHECK_IN, IN_PROGRESS, QC, RELEASE]
 *     responses:
 *       201:
 *         description: Photo uploaded and added
 */
router.post(
    "/:id/photos/upload",
    authenticate,
    authorize(ROLES.WORKSHOPSTAFF, ROLES.OPERATIONSTAFF, ROLES.BRANCHMANAGER, ROLES.ADMIN, ROLES.WORKSHOPMANAGER),
    upload.single("photo"),
    uploadWorkOrderPhotoHandler
);

/**
 * @swagger
 * /api/work-orders/{id}/photos/{photoId}:
 *   delete:
 *     summary: Remove a photo from a work order
 *     tags: [WorkOrder]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: photoId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Photo removed
 */
router.delete(
    "/:id/photos/:photoId",
    authenticate,
    authorize(ROLES.WORKSHOPSTAFF, ROLES.OPERATIONSTAFF, ROLES.BRANCHMANAGER, ROLES.ADMIN, ROLES.WORKSHOPMANAGER),
    removePhotoHandler
);

// ═══════════════════════════════════════════════════════════════════════
//  VEHICLE RELEASE
// ═══════════════════════════════════════════════════════════════════════

/**
 * @swagger
 * /api/work-orders/{id}/release:
 *   put:
 *     summary: Release vehicle from workshop
 *     description: |
 *       Validates QC passed, sets release data, transitions WO to VEHICLE_RELEASED,
 *       and syncs vehicle status back to ACTIVE.
 *     tags: [WorkOrder]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               odometerAtRelease:
 *                 type: number
 *               releaseNotes:
 *                 type: string
 *     responses:
 *       200:
 *         description: Vehicle released
 *       400:
 *         description: QC not passed or wrong status
 */
router.put(
    "/:id/release",
    authenticate,
    authorize(ROLES.WORKSHOPSTAFF, ROLES.OPERATIONSTAFF, ROLES.BRANCHMANAGER, ROLES.ADMIN, ROLES.WORKSHOPMANAGER),
    releaseVehicleHandler
);

module.exports = router;

