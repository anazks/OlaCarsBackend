const express = require("express");
const router = express.Router();
const {
    addBranchManager,
    editBranchManager,
    changePassword,
    deleteBranchManager,
    getBranchManagers,
    getBranchManagerById,
    login,
    logout,
    refreshToken
} = require("../Controller/BranchManagerController.js");
const { authorize } = require("../../../shared/middlewares/roleMiddleWare.js");
const { authenticate } = require("../../../shared/middlewares/authMiddleware.js");
const { hasPermission } = require("../../../shared/middlewares/permissionMiddleware.js");
const { ROLES } = require("../../../shared/constants/roles.js");
const validate = require("../../../shared/middlewares/validate.js");
const {
    loginSchema,
    addBranchManagerSchema,
    editBranchManagerSchema,
    changePasswordSchema,
    deleteBranchManagerSchema,
    getBranchManagerByIdSchema,
    refreshTokenSchema,
} = require("../Validation/BranchManagerValidation.js");


/**
 * @swagger
 * tags:
 *   name: BranchManager
 *   description: Branch Manager Management APIs
 */

/**
 * @swagger
 * /api/branch-manager/login:
 *   post:
 *     summary: Branch Manager login
 *     tags: [BranchManager]
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
 * /api/branch-manager/refresh:
 *   post:
 *     summary: Refresh Branch Manager access token
 *     tags: [BranchManager]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - refreshToken
 *             properties:
 *               refreshToken:
 *                 type: string
 *                 example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *     responses:
 *       200:
 *         description: Token refreshed successful
 */
router.post("/refresh", validate(refreshTokenSchema), refreshToken);


/**
 * @swagger
 * /api/branch-manager/logout:
 *   post:
 *     summary: Branch Manager logout
 *     tags: [BranchManager]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Logout successful
 */
router.post("/logout", authenticate, logout);

/**
 * @swagger
 * /api/branch-manager:
 *   post:
 *     summary: Create new Branch Manager
 *     tags: [BranchManager]
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
 *               twoFactorEnabled:
 *                 type: boolean
 *     responses:
 *       201:
 *         description: Branch Manager created successfully
 */
router.post(
    "/",
    authenticate,
    authorize(ROLES.ADMIN, ROLES.OPERATIONADMIN, ROLES.FINANCEADMIN, ROLES.COUNTRYMANAGER),
    hasPermission("STAFF_CREATE"),
    validate(addBranchManagerSchema),
    addBranchManager
);

/**
 * @swagger
 * /api/branch-manager:
 *   get:
 *     summary: Get all Branch Managers
 *     tags: [BranchManager]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of Branch Managers
 */
router.get(
    "/",
    authenticate,
    authorize(ROLES.ADMIN, ROLES.OPERATIONADMIN, ROLES.FINANCEADMIN, ROLES.COUNTRYMANAGER),
    hasPermission("STAFF_VIEW"),
    getBranchManagers
);

/**
 * @swagger
 * /api/branch-manager/{id}:
 *   get:
 *     summary: Get Branch Manager by ID
 *     tags: [BranchManager]
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
 *         description: Branch Manager details
 */
router.get(
    "/:id",
    authenticate,
    authorize(ROLES.ADMIN, ROLES.OPERATIONADMIN, ROLES.FINANCEADMIN, ROLES.COUNTRYMANAGER),
    hasPermission("STAFF_VIEW"),
    validate(getBranchManagerByIdSchema),
    getBranchManagerById
);

/**
 * @swagger
 * /api/branch-manager/{id}:
 *   put:
 *     summary: Update Branch Manager
 *     tags: [BranchManager]
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
 *               twoFactorEnabled:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Branch Manager updated successfully
 */
router.put(
    "/:id",
    authenticate,
    authorize(ROLES.ADMIN, ROLES.OPERATIONADMIN, ROLES.FINANCEADMIN, ROLES.COUNTRYMANAGER),
    hasPermission("STAFF_EDIT"),
    validate(editBranchManagerSchema),
    editBranchManager
);

/**
 * @swagger
 * /api/branch-manager/{id}/change-password:
 *   post:
 *     summary: Change Branch Manager password
 *     tags: [BranchManager]
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
    authorize(ROLES.ADMIN, ROLES.OPERATIONADMIN, ROLES.FINANCEADMIN, ROLES.COUNTRYMANAGER),
    hasPermission("STAFF_EDIT"),
    validate(changePasswordSchema),
    changePassword
);

/**
 * @swagger
 * /api/branch-manager/{id}:
 *   delete:
 *     summary: Soft Delete Branch Manager
 *     tags: [BranchManager]
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
 *         description: Branch Manager deleted successfully
 */
router.delete(
    "/:id",
    authenticate,
    authorize(ROLES.ADMIN, ROLES.OPERATIONADMIN, ROLES.FINANCEADMIN, ROLES.COUNTRYMANAGER),
    hasPermission("STAFF_DELETE"),
    validate(deleteBranchManagerSchema),
    deleteBranchManager
);

module.exports = router;
