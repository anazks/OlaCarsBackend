const express = require("express");
const router = express.Router();
const {
    login,
    refreshToken,
    addOperationalAdmin,
    getOperationalAdmins,
    getOperationalAdminById,
    editOperationalAdmin,
    changePassword,
    deleteOperationalAdmin
} = require("../Controller/OperationAdminController.js");
const { authenticate } = require("../../../shared/middlewares/authMiddleware.js");
const { authorize } = require("../../../shared/middlewares/roleMiddleWare.js");
const { ROLES } = require("../../../shared/constants/roles.js");
const validate = require("../../../shared/middlewares/validate.js");
const {
    loginSchema,
    addOperationalAdminSchema,
    editOperationalAdminSchema,
    changePasswordSchema,
    deleteOperationalAdminSchema,
    getOperationalAdminByIdSchema,
} = require("../Validation/OperationAdminValidation.js");

/**
 * @swagger
 * tags:
 *   name: OperationalAdmin
 *   description: OperationalAdmin Authentication APIs
 */

/**
 * @swagger
 * /api/operational-admin/login:
 *   post:
 *     summary: OperationalAdmin login
 *     tags: [OperationalAdmin]
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
 *                 example: operationaladmin@olacars.com
 *               password:
 *                 type: string
 *                 example: StrongPassword@123
 *     responses:
 *       200:
 *         description: Login successful
 *       401:
 *         description: Invalid credentials
 */
router.post("/login", validate(loginSchema), login);

/**
 * @swagger
 * /api/operational-admin/refresh:
 *   post:
 *     summary: Refresh access token
 *     tags: [OperationalAdmin]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               refreshToken:
 *                 type: string
 *     responses:
 *       200:
 *         description: New access token generated
 */
router.post("/refresh", refreshToken);

/**
 * @swagger
 * /api/operational-admin:
 *   post:
 *     summary: Create new Operational Admin
 *     tags: [OperationalAdmin]
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
 *             properties:
 *               fullName:
 *                 type: string
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *               status:
 *                 type: string
 *                 enum: [ACTIVE, SUSPENDED, LOCKED]
 *               twoFactorEnabled:
 *                 type: boolean
 *     responses:
 *       201:
 *         description: Operational Admin created successfully
 */
router.post(
    "/",
    authenticate,
    authorize(ROLES.ADMIN),
    validate(addOperationalAdminSchema),
    addOperationalAdmin
);

/**
 * @swagger
 * /api/operational-admin:
 *   get:
 *     summary: Get all Operational Admins
 *     tags: [OperationalAdmin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of Operational Admins
 */
router.get(
    "/",
    authenticate,
    authorize(ROLES.ADMIN),
    getOperationalAdmins
);

/**
 * @swagger
 * /api/operational-admin/{id}:
 *   get:
 *     summary: Get Operational Admin by ID
 *     tags: [OperationalAdmin]
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
 *         description: Operational Admin details
 */
router.get(
    "/:id",
    authenticate,
    authorize(ROLES.ADMIN),
    validate(getOperationalAdminByIdSchema),
    getOperationalAdminById
);

/**
 * @swagger
 * /api/operational-admin/{id}:
 *   put:
 *     summary: Update an Operational Admin
 *     tags: [OperationalAdmin]
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
 *               status:
 *                 type: string
 *                 enum: [ACTIVE, SUSPENDED, LOCKED]
 *               twoFactorEnabled:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Operational Admin updated successfully
 */
router.put(
    "/:id",
    authenticate,
    authorize(ROLES.ADMIN),
    validate(editOperationalAdminSchema),
    editOperationalAdmin
);

/**
 * @swagger
 * /api/operational-admin/{id}/change-password:
 *   post:
 *     summary: Change Operational Admin password
 *     tags: [OperationalAdmin]
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
    authorize(ROLES.ADMIN),
    validate(changePasswordSchema),
    changePassword
);

/**
 * @swagger
 * /api/operational-admin/{id}:
 *   delete:
 *     summary: Soft Delete an Operational Admin
 *     tags: [OperationalAdmin]
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
 *         description: Operational Admin deleted successfully
 */
router.delete(
    "/:id",
    authenticate,
    authorize(ROLES.ADMIN),
    validate(deleteOperationalAdminSchema),
    deleteOperationalAdmin
);

module.exports = router;
