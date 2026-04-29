const express = require("express");
const router = express.Router();
const {
    addWorkshopManager,
    editWorkshopManager,
    changePassword,
    deleteWorkshopManager,
    getWorkshopManager,
    getWorkshopManagerById,
    login,
    refreshManagerToken
} = require("../Controller/WorkshopManagerController.js");
const { authorize } = require("../../../shared/middlewares/roleMiddleWare.js");
const { authenticate } = require("../../../shared/middlewares/authMiddleware.js");
const { hasPermission } = require("../../../shared/middlewares/permissionMiddleware.js");
const { ROLES } = require("../../../shared/constants/roles.js");
const validate = require("../../../shared/middlewares/validate.js");
const {
    loginSchema,
    addWorkshopManagerSchema,
    editWorkshopManagerSchema,
    changePasswordSchema,
    deleteWorkshopManagerSchema,
    getWorkshopManagerByIdSchema,
    refreshManagerTokenSchema,
} = require("../Validation/WorkshopManagerValidation.js");

/**
 * @swagger
 * tags:
 *   name: WorkshopManager
 *   description: Workshop Manager APIs
 */

/**
 * @swagger
 * /api/workshop-manager/login:
 *   post:
 *     summary: Workshop Manager login
 *     tags: [WorkshopManager]
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
 * /api/workshop-manager:
 *   post:
 *     summary: Create new Workshop Manager
 *     tags: [WorkshopManager]
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
 *         description: Manager created successfully
 */
router.post(
    "/",
    authenticate,
    authorize(ROLES.BRANCHMANAGER, ROLES.ADMIN, ROLES.OPERATIONADMIN, ROLES.COUNTRYMANAGER),
    hasPermission("STAFF_CREATE"),
    validate(addWorkshopManagerSchema),
    addWorkshopManager
);

/**
 * @swagger
 * /api/workshop-manager:
 *   get:
 *     summary: Get all Workshop Managers
 *     tags: [WorkshopManager]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of Managers
 */
router.get(
    "/",
    authenticate,
    authorize(ROLES.BRANCHMANAGER, ROLES.ADMIN, ROLES.OPERATIONADMIN, ROLES.COUNTRYMANAGER, ROLES.FINANCEADMIN),
    hasPermission("STAFF_VIEW"),
    getWorkshopManager
);

/**
 * @swagger
 * /api/workshop-manager/{id}:
 *   get:
 *     summary: Get Workshop Manager by ID
 *     tags: [WorkshopManager]
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
 *         description: Manager details
 */
router.get(
    "/:id",
    authenticate,
    authorize(ROLES.BRANCHMANAGER, ROLES.ADMIN, ROLES.OPERATIONADMIN, ROLES.COUNTRYMANAGER),
    hasPermission("STAFF_VIEW"),
    validate(getWorkshopManagerByIdSchema),
    getWorkshopManagerById
);

/**
 * @swagger
 * /api/workshop-manager/{id}:
 *   put:
 *     summary: Update Workshop Manager
 *     tags: [WorkshopManager]
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
 *         description: Manager updated successfully
 */
router.put(
    "/:id",
    authenticate,
    authorize(ROLES.BRANCHMANAGER, ROLES.ADMIN, ROLES.OPERATIONADMIN, ROLES.COUNTRYMANAGER),
    hasPermission("STAFF_EDIT"),
    validate(editWorkshopManagerSchema),
    editWorkshopManager
);

/**
 * @swagger
 * /api/workshop-manager/{id}/change-password:
 *   post:
 *     summary: Change Workshop Manager password
 *     tags: [WorkshopManager]
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
    authorize(ROLES.BRANCHMANAGER, ROLES.ADMIN, ROLES.OPERATIONADMIN, ROLES.COUNTRYMANAGER),
    hasPermission("STAFF_EDIT"),
    validate(changePasswordSchema),
    changePassword
);

/**
 * @swagger
 * /api/workshop-manager/{id}:
 *   delete:
 *     summary: Soft Delete Workshop Manager
 *     tags: [WorkshopManager]
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
 *         description: Manager deleted successfully
 */
router.delete(
    "/:id",
    authenticate,
    authorize(ROLES.BRANCHMANAGER, ROLES.ADMIN, ROLES.OPERATIONADMIN, ROLES.COUNTRYMANAGER),
    hasPermission("STAFF_DELETE"),
    validate(deleteWorkshopManagerSchema),
    deleteWorkshopManager
);

/**
 * @swagger
 * /api/workshop-manager/refresh-token:
 *   post:
 *     summary: Refresh access token
 *     tags: [WorkshopManager]
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
router.post("/refresh-token", validate(refreshManagerTokenSchema), refreshManagerToken);

module.exports = router;
