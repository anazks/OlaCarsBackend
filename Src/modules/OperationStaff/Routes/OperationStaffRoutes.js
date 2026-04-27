const express = require("express");
const router = express.Router();
const {
    addOperationStaff,
    editOperationStaff,
    changePassword,
    deleteOperationStaff,
    getOperationStaff,
    getOperationStaffById,
    login,
    logout,
    refreshStaffToken
} = require("../Controller/OperationStaffController.js");
const { authorize } = require("../../../shared/middlewares/roleMiddleWare.js");
const { authenticate } = require("../../../shared/middlewares/authMiddleware.js");
const { hasPermission } = require("../../../shared/middlewares/permissionMiddleware.js");
const { ROLES } = require("../../../shared/constants/roles.js");
const validate = require("../../../shared/middlewares/validate.js");
const {
    loginSchema,
    addOperationStaffSchema,
    editOperationStaffSchema,
    changePasswordSchema,
    deleteOperationStaffSchema,
    getOperationStaffByIdSchema,
    refreshStaffTokenSchema,
} = require("../Validation/OperationStaffValidation.js");

/**
 * @swagger
 * tags:
 *   name: OperationStaff
 *   description: Operation Staff APIs
 */

/**
 * @swagger
 * /api/operation-staff/login:
 *   post:
 *     summary: Operation Staff login
 *     tags: [OperationStaff]
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
 *                 example: "user@olacars.com"
 *               password:
 *                 type: string
 *                 example: "StrongPassword@123"
 *     responses:
 *       200:
 *         description: Login successful
 */
router.post("/login", validate(loginSchema), login);

/**
 * @swagger
 * /api/operation-staff/logout:
 *   post:
 *     summary: Operation Staff logout
 *     tags: [OperationStaff]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Logout successful
 */
router.post("/logout", authenticate, logout);

/**
 * @swagger
 * /api/operation-staff:
 *   post:
 *     summary: Create new Operation Staff
 *     tags: [OperationStaff]
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
 *                 example: "user@olacars.com"
 *               password:
 *                 type: string
 *                 example: "StrongPassword@123"
 *               phone:
 *                 type: string
 *                 example: "+1234567890"
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
    authorize(ROLES.BRANCHMANAGER, ROLES.ADMIN, ROLES.OPERATIONADMIN),
    hasPermission("STAFF_CREATE"),
    validate(addOperationStaffSchema),
    addOperationStaff
);

/**
 * @swagger
 * /api/operation-staff:
 *   get:
 *     summary: Get all Operation Staff
 *     tags: [OperationStaff]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of Staff
 */
router.get(
    "/",
    authenticate,
    authorize(ROLES.BRANCHMANAGER, ROLES.COUNTRYMANAGER, ROLES.ADMIN, ROLES.OPERATIONADMIN),
    hasPermission("STAFF_VIEW"),
    getOperationStaff
);

/**
 * @swagger
 * /api/operation-staff/{id}:
 *   get:
 *     summary: Get Operation Staff by ID
 *     tags: [OperationStaff]
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
    authorize(ROLES.BRANCHMANAGER, ROLES.COUNTRYMANAGER, ROLES.ADMIN, ROLES.OPERATIONADMIN),
    hasPermission("STAFF_VIEW"),
    validate(getOperationStaffByIdSchema),
    getOperationStaffById
);

/**
 * @swagger
 * /api/operation-staff/{id}:
 *   put:
 *     summary: Update Operation Staff
 *     tags: [OperationStaff]
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
 *                 example: "user@olacars.com"
 *               password:
 *                 type: string
 *                 example: "StrongPassword@123"
 *               phone:
 *                 type: string
 *                 example: "+1234567890"
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
    authorize(ROLES.BRANCHMANAGER, ROLES.ADMIN, ROLES.OPERATIONADMIN),
    hasPermission("STAFF_EDIT"),
    validate(editOperationStaffSchema),
    editOperationStaff
);

/**
 * @swagger
 * /api/operation-staff/{id}/change-password:
 *   post:
 *     summary: Change Operation Staff password
 *     tags: [OperationStaff]
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
 *                 example: "OldPassword@123"
 *               newPassword:
 *                 type: string
 *                 example: "NewStrongPassword@123"
 *     responses:
 *       200:
 *         description: Password changed successfully
 */
router.post(
    "/:id/change-password",
    authenticate,
    authorize(ROLES.BRANCHMANAGER, ROLES.ADMIN, ROLES.OPERATIONADMIN),
    hasPermission("STAFF_EDIT"),
    validate(changePasswordSchema),
    changePassword
);

/**
 * @swagger
 * /api/operation-staff/{id}:
 *   delete:
 *     summary: Soft Delete Operation Staff
 *     tags: [OperationStaff]
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
    authorize(ROLES.BRANCHMANAGER, ROLES.ADMIN, ROLES.OPERATIONADMIN),
    hasPermission("STAFF_DELETE"),
    validate(deleteOperationStaffSchema),
    deleteOperationStaff
);

/**
 * @swagger
 * /api/operation-staff/refresh-token:
 *   post:
 *     summary: Refresh access token
 *     tags: [OperationStaff]
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
