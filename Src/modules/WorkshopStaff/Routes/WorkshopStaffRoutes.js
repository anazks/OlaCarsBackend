const express = require("express");
const router = express.Router();
const {
    addWorkshopStaff,
    editWorkshopStaff,
    changePassword,
    deleteWorkshopStaff,
    getWorkshopStaff,
    getWorkshopStaffById,
    login,
    refreshStaffToken
} = require("../Controller/WorkshopStaffController.js");
const { authorize } = require("../../../shared/middlewares/roleMiddleWare.js");
const { authenticate } = require("../../../shared/middlewares/authMiddleware.js");
const { ROLES } = require("../../../shared/constants/roles.js");
const validate = require("../../../shared/middlewares/validate.js");
const {
    loginSchema,
    addWorkshopStaffSchema,
    editWorkshopStaffSchema,
    changePasswordSchema,
    deleteWorkshopStaffSchema,
    getWorkshopStaffByIdSchema,
    refreshStaffTokenSchema,
} = require("../Validation/WorkshopStaffValidation.js");

/**
 * @swagger
 * tags:
 *   name: WorkshopStaff
 *   description: Workshop Staff APIs
 */

/**
 * @swagger
 * /api/workshop-staff/login:
 *   post:
 *     summary: Workshop Staff login
 *     tags: [WorkshopStaff]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Login successful
 */
router.post("/login", validate(loginSchema), login);

/**
 * @swagger
 * /api/workshop-staff:
 *   post:
 *     summary: Create new Workshop Staff
 *     tags: [WorkshopStaff]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - fullName
 *               - email
 *               - password
 *               - branchId
 *             properties:
 *               fullName:
 *                 type: string
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *               phone:
 *                 type: string
 *               branchId:
 *                 type: string
 *               status:
 *                 type: string
 *                 enum: [ACTIVE, SUSPENDED, LOCKED]
 *     responses:
 *       201:
 *         description: Staff created successfully
 */
router.post(
    "/",
    authenticate,
    authorize(ROLES.BRANCHMANAGER, ROLES.ADMIN, ROLES.OPERATIONADMIN, ROLES.COUNTRYMANAGER),
    validate(addWorkshopStaffSchema),
    addWorkshopStaff
);

/**
 * @swagger
 * /api/workshop-staff:
 *   get:
 *     summary: Get all Workshop Staff
 *     tags: [WorkshopStaff]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of Staff
 */
router.get(
    "/",
    authenticate,
    authorize(ROLES.BRANCHMANAGER, ROLES.ADMIN, ROLES.OPERATIONADMIN, ROLES.COUNTRYMANAGER),
    getWorkshopStaff
);

/**
 * @swagger
 * /api/workshop-staff/{id}:
 *   get:
 *     summary: Get Workshop Staff by ID
 *     tags: [WorkshopStaff]
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
 *         description: Staff details
 */
router.get(
    "/:id",
    authenticate,
    authorize(ROLES.BRANCHMANAGER, ROLES.ADMIN, ROLES.OPERATIONADMIN, ROLES.COUNTRYMANAGER),
    validate(getWorkshopStaffByIdSchema),
    getWorkshopStaffById
);

/**
 * @swagger
 * /api/workshop-staff/{id}:
 *   put:
 *     summary: Update Workshop Staff
 *     tags: [WorkshopStaff]
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
 *               fullName:
 *                 type: string
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *               phone:
 *                 type: string
 *               branchId:
 *                 type: string
 *               status:
 *                 type: string
 *                 enum: [ACTIVE, SUSPENDED, LOCKED]
 *     responses:
 *       200:
 *         description: Staff updated successfully
 */
router.put(
    "/:id",
    authenticate,
    authorize(ROLES.BRANCHMANAGER, ROLES.ADMIN, ROLES.OPERATIONADMIN, ROLES.COUNTRYMANAGER),
    validate(editWorkshopStaffSchema),
    editWorkshopStaff
);

/**
 * @swagger
 * /api/workshop-staff/{id}/change-password:
 *   post:
 *     summary: Change Workshop Staff password
 *     tags: [WorkshopStaff]
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
 *               - currentPassword
 *               - newPassword
 *             properties:
 *               currentPassword:
 *                 type: string
 *               newPassword:
 *                 type: string
 *     responses:
 *       200:
 *         description: Password changed successfully
 */
router.post(
    "/:id/change-password",
    authenticate,
    authorize(ROLES.BRANCHMANAGER, ROLES.ADMIN, ROLES.OPERATIONADMIN, ROLES.COUNTRYMANAGER),
    validate(changePasswordSchema),
    changePassword
);

/**
 * @swagger
 * /api/workshop-staff/{id}:
 *   delete:
 *     summary: Soft Delete Workshop Staff
 *     tags: [WorkshopStaff]
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
 *         description: Staff deleted successfully
 */
router.delete(
    "/:id",
    authenticate,
    authorize(ROLES.BRANCHMANAGER, ROLES.ADMIN, ROLES.OPERATIONADMIN, ROLES.COUNTRYMANAGER),
    validate(deleteWorkshopStaffSchema),
    deleteWorkshopStaff
);

/**
 * @swagger
 * /api/workshop-staff/refresh-token:
 *   post:
 *     summary: Refresh access token
 *     tags: [WorkshopStaff]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - token
 *             properties:
 *               token:
 *                 type: string
 *     responses:
 *       200:
 *         description: New tokens generated
 */
router.post("/refresh-token", validate(refreshStaffTokenSchema), refreshStaffToken);

module.exports = router;
