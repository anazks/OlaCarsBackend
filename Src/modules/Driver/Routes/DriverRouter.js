const express = require("express");
const router = express.Router();
const {
    addDriver,
    getDrivers,
    getDriverById,
    editDriver,
    progressDriverStatus,
    uploadDriverDocuments,
    deleteDriver,
    markRentAsPaid,
    updatePerformance,
    getDriverMe,
    bulkAddDrivers,
} = require("../Controller/DriverController");
const { authenticate } = require("../../../shared/middlewares/authMiddleware");
const { authorize } = require("../../../shared/middlewares/roleMiddleWare");
const { hasPermission } = require("../../../shared/middlewares/permissionMiddleware");
const { ROLES } = require("../../../shared/constants/roles");
const upload = require("../../../utils/multerConfig");
const { Driver } = require("../Model/DriverModel");
// Helper to allow the driver to access their own record OR staff with permission
const hasSelfOrStaffPermission = (permission) => {
    return (req, res, next) => {
        const userId = String(req.user.id || req.user._id || "");
        const targetId = String(req.params.id || "");
        // 1. If it's a driver, they MUST be accessing their own record
        if (req.user.role === "USER") {
            if (userId === targetId) {
                return next();
            } else {
                console.log(`[hasSelfOrStaffPermission] Driver ${userId} attempted to access ${targetId}`);
                return res.status(403).json({ 
                    success: false, 
                    message: `Access denied. You are logged in as driver ${userId} but trying to access driver ${targetId}.`
                });
            }
        }
        // 2. If it's staff, fallback to permission check
        return hasPermission(permission)(req, res, next);
    };
};
/**
 * @swagger
 * tags:
 *   name: Driver
 *   description: Driver Onboarding & Lifecycle Management
 */
/**
 * @swagger
 * components:
 *   schemas:
 *     DriverPersonalInfo:
 *       type: object
 *       properties:
 *         fullName:
 *           type: string
 *         dateOfBirth:
 *           type: string
 *           format: date
 *         nationality:
 *           type: string
 *         email:
 *           type: string
 *           example: "user@olacars.com"
 *         phone:
 *           type: string
 *           example: "+1234567890"
 *         whatsappNumber:
 *           type: string
 *     DriverStatus:
 *       type: string
 *       enum:
 *         - DRAFT
 *         - PENDING REVIEW
 *         - VERIFICATION
 *         - CREDIT CHECK
 *         - MANAGER REVIEW
 *         - APPROVED
 *         - CONTRACT PENDING
 *         - ACTIVE
 *         - SUSPENDED
 *         - REJECTED
 */
// ─── POST /api/driver — Create New Driver Application ─────────────────
/**
 * @swagger
 * /api/driver:
 *   post:
 *     summary: Create a new driver application
 *     tags: [Driver]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - personalInfo
 *               - branch
 *             properties:
 *               personalInfo:
 *                 $ref: '#/components/schemas/DriverPersonalInfo'
 *               branch:
 *                 type: string
 *                 description: Branch ObjectId
 *               identityDocs:
 *                 type: object
 *                 properties:
 *                   idType:
 *                     type: string
 *                     enum: [National ID, Passport]
 *                   idNumber:
 *                     type: string
 *               emergencyContact:
 *                 type: object
 *                 properties:
 *                   name:
 *                     type: string
 *                   relationship:
 *                     type: string
 *                   phone:
 *                     type: string
 *                     example: "+1234567890"
 *     responses:
 *       201:
 *         description: Driver application created with DRAFT status
 *       500:
 *         description: Server error
 */
router.post(
    "/",
    authenticate,
    authorize(ROLES.OPERATIONSTAFF, ROLES.FINANCESTAFF, ROLES.BRANCHMANAGER, ROLES.COUNTRYMANAGER, ROLES.ADMIN),
    hasPermission("DRIVER_CREATE"),
    addDriver
);
// ─── POST /api/driver/bulk — Bulk Create Drivers ──────────────────────
/**
 * @swagger
 * /api/driver/bulk:
 *   post:
 *     summary: Bulk-create driver applications from parsed CSV/TXT data
 *     description: |
 *       Accepts a JSON array of driver records (no branch column in CSV).
 *       Branch assignment:
 *         - OPERATIONSTAFF/FINANCESTAFF/BRANCHMANAGER: auto-assigned from JWT branchId.
 *         - COUNTRYMANAGER/ADMIN: must provide a top-level `branch` field (selected via UI dropdown).
 *     tags: [Driver]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - drivers
 *             properties:
 *               branch:
 *                 type: string
 *                 description: Branch ObjectId (required only for COUNTRYMANAGER/ADMIN roles)
 *               drivers:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required:
 *                     - fullName
 *                     - email
 *                     - phone
 *                   properties:
 *                     fullName:
 *                       type: string
 *                     email:
 *                       type: string
 *                     phone:
 *                       type: string
 *                     nationality:
 *                       type: string
 *                     licenseNumber:
 *                       type: string
 *     responses:
 *       201:
 *         description: Drivers created (may contain partial errors)
 *       400:
 *         description: Invalid payload, missing branch, or all rows failed
 */
router.post(
    "/bulk",
    authenticate,
    authorize(ROLES.OPERATIONSTAFF, ROLES.FINANCESTAFF, ROLES.BRANCHMANAGER, ROLES.COUNTRYMANAGER, ROLES.ADMIN),
    hasPermission("DRIVER_CREATE"),
    bulkAddDrivers
);
// ─── GET /api/driver — List Drivers ───────────────────────────────────
/**
 * @swagger
 * /api/driver:
 *   get:
 *     summary: List all drivers (filterable by status, branch)
 *     tags: [Driver]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           $ref: '#/components/schemas/DriverStatus'
 *         description: Filter by onboarding status
 *       - in: query
 *         name: branch
 *         schema:
 *           type: string
 *         description: Filter by branch ObjectId
 *     responses:
 *       200:
 *         description: List of drivers
 */
router.get(
    "/",
    authenticate,
    authorize(ROLES.FINANCESTAFF, ROLES.FINANCEADMIN, ROLES.BRANCHMANAGER, ROLES.COUNTRYMANAGER, ROLES.ADMIN),
    hasPermission("DRIVER_VIEW"),
    getDrivers
);
// ─── GET /api/driver/me — Get Current Driver ─────────────────────────
/**
 * @swagger
 * /api/driver/me:
 *   get:
 *     summary: Get logged-in driver's details
 *     tags: [Driver]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Driver details
 *       404:
 *         description: Driver not found
 */
router.get(
    "/me",
    authenticate,
    getDriverMe
);
// ─── GET /api/driver/:id — Get Single Driver ─────────────────────────
/**
 * @swagger
 * /api/driver/{id}:
 *   get:
 *     summary: Get driver by ID
 *     tags: [Driver]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Driver details
 *       404:
 *         description: Driver not found
 */
router.get(
    "/:id",
    authenticate,
    authorize(ROLES.FINANCESTAFF, ROLES.FINANCEADMIN, ROLES.BRANCHMANAGER, ROLES.COUNTRYMANAGER, ROLES.ADMIN, ROLES.USER),
    hasSelfOrStaffPermission("DRIVER_VIEW"),
    getDriverById
);
// ─── PUT /api/driver/:id — Edit Driver Fields ────────────────────────
/**
 * @swagger
 * /api/driver/{id}:
 *   put:
 *     summary: Update driver fields (non-workflow, e.g. personal info edits)
 *     tags: [Driver]
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
 *             properties:
 *               personalInfo:
 *                 $ref: '#/components/schemas/DriverPersonalInfo'
 *               identityDocs:
 *                 type: object
 *               drivingLicense:
 *                 type: object
 *               emergencyContact:
 *                 type: object
 *               bankDetails:
 *                 type: object
 *     responses:
 *       200:
 *         description: Driver updated
 *       404:
 *         description: Driver not found
 */
router.put(
    "/:id",
    authenticate,
    authorize(ROLES.FINANCESTAFF, ROLES.FINANCEADMIN, ROLES.BRANCHMANAGER, ROLES.COUNTRYMANAGER, ROLES.ADMIN, ROLES.USER),
    hasSelfOrStaffPermission("DRIVER_EDIT"),
    editDriver
);
// ─── PUT /api/driver/:id/progress — Workflow Status Transition ───────
/**
 * @swagger
 * /api/driver/{id}/progress:
 *   put:
 *     summary: Progress driver through onboarding workflow
 *     description: |
 *       Transitions a driver to a new status.
 *       Valid flow: DRAFT → PENDING REVIEW → VERIFICATION → CREDIT CHECK → APPROVED → CONTRACT PENDING → ACTIVE.
 *       Branching: CREDIT CHECK → MANAGER REVIEW → APPROVED/REJECTED.
 *       Any stage can be REJECTED by a Branch Manager.
 *       ACTIVE drivers can be SUSPENDED and reactivated.
 *     tags: [Driver]
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
 *                 $ref: '#/components/schemas/DriverStatus'
 *               updateData:
 *                 type: object
 *                 description: Additional data to save with the transition (e.g. creditCheck.score, rejection.reason)
 *               notes:
 *                 type: string
 *                 description: Optional notes for the audit trail
 *     responses:
 *       200:
 *         description: Driver status updated
 *       400:
 *         description: Invalid transition
 *       403:
 *         description: Unauthorized role
 *       422:
 *         description: Gate validation failed (missing prerequisites)
 */
router.put(
    "/:id/progress",
    authenticate,
    authorize(ROLES.FINANCESTAFF, ROLES.FINANCEADMIN, ROLES.BRANCHMANAGER, ROLES.COUNTRYMANAGER, ROLES.ADMIN, ROLES.USER),
    hasSelfOrStaffPermission("DRIVER_ONBOARD"),
    progressDriverStatus
);
// ─── POST /api/driver/:id/upload-documents — S3 Upload ───────────────
/**
 * @swagger
 * /api/driver/{id}/upload-documents:
 *   post:
 *     summary: Upload driver documents to AWS S3
 *     description: |
 *       Upload one or more document files. Use field names matching the schema:
 *       photograph, idFrontImage, idBackImage, licenseFront, licenseBack,
 *       backgroundCheckDocument, addressProofDocument, medicalCertificate,
 *       consentForm, contractPDF, signedContract
 *     tags: [Driver]
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
 *               photograph:
 *                 type: string
 *                 format: binary
 *               idFrontImage:
 *                 type: string
 *                 format: binary
 *               idBackImage:
 *                 type: string
 *                 format: binary
 *               licenseFront:
 *                 type: string
 *                 format: binary
 *               licenseBack:
 *                 type: string
 *                 format: binary
 *               backgroundCheckDocument:
 *                 type: string
 *                 format: binary
 *               addressProofDocument:
 *                 type: string
 *                 format: binary
 *               medicalCertificate:
 *                 type: string
 *                 format: binary
 *               consentForm:
 *                 type: string
 *                 format: binary
 *               contractPDF:
 *                 type: string
 *                 format: binary
 *               signedContract:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Documents uploaded successfully
 *       400:
 *         description: No documents provided
 *       404:
 *         description: Driver not found
 */
router.post(
    "/:id/upload-documents",
    authenticate,
    authorize(ROLES.FINANCESTAFF, ROLES.FINANCEADMIN, ROLES.BRANCHMANAGER, ROLES.COUNTRYMANAGER, ROLES.ADMIN, ROLES.USER),
    hasSelfOrStaffPermission("DRIVER_EDIT"),
    upload.fields([
        { name: "photograph", maxCount: 1 },
        { name: "idFrontImage", maxCount: 1 },
        { name: "idBackImage", maxCount: 1 },
        { name: "licenseFront", maxCount: 1 },
        { name: "licenseBack", maxCount: 1 },
        { name: "backgroundCheckDocument", maxCount: 1 },
        { name: "addressProofDocument", maxCount: 1 },
        { name: "medicalCertificate", maxCount: 1 },
        { name: "consentForm", maxCount: 1 },
        { name: "contractPDF", maxCount: 1 },
        { name: "signedContract", maxCount: 1 },
    ]),
    uploadDriverDocuments
);
// ─── DELETE /api/driver/:id — Soft Delete ────────────────────────────
/**
 * @swagger
 * /api/driver/{id}:
 *   delete:
 *     summary: Soft-delete a driver record
 *     tags: [Driver]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Driver deleted successfully
 */
router.delete(
    "/:id",
    authenticate,
    authorize(ROLES.BRANCHMANAGER, ROLES.COUNTRYMANAGER, ROLES.ADMIN),
    hasPermission("DRIVER_DELETE"),
    deleteDriver
);
// ─── PUT /api/driver/:id/rent/pay — Mark Rent as Paid ────────────────
router.put(
    "/:id/rent/pay",
    authenticate,
    authorize(ROLES.FINANCESTAFF, ROLES.BRANCHMANAGER, ROLES.COUNTRYMANAGER, ROLES.FINANCEADMIN, ROLES.ADMIN),
    hasPermission("PAYMENT_CREATE"),
    markRentAsPaid
);
// ─── PUT /api/driver/:id/performance — Update Metrics ────────────────
router.put(
    "/:id/performance",
    authenticate,
    authorize(ROLES.OPERATIONSTAFF, ROLES.BRANCHMANAGER, ROLES.COUNTRYMANAGER, ROLES.ADMIN),
    hasPermission("STAFF_PERFORMANCE_EDIT"),
    updatePerformance
);
module.exports = router;

