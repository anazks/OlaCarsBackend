const express = require("express");
const router = express.Router();
const {
    login,
    refreshToken,
    addFinanceAdmin,
    getFinanceAdmins,
    getFinanceAdminById,
    editFinanceAdmin,
    changePassword,
    deleteFinanceAdmin
} = require("../Controller/FinanceAdminController.js");
const { authenticate } = require("../../../shared/middlewares/authMiddleware.js");
const { authorize } = require("../../../shared/middlewares/roleMiddleWare.js");
const { ROLES } = require("../../../shared/constants/roles.js");
const validate = require("../../../shared/middlewares/validate.js");
const {
    loginSchema,
    addFinanceAdminSchema,
    editFinanceAdminSchema,
    changePasswordSchema,
    deleteFinanceAdminSchema,
    getFinanceAdminByIdSchema,
} = require("../Validation/FinanceAdminValidation.js");

/**
 * @swagger
 * tags:
 *   name: FinanceAdmin
 *   description: FinanceAdmin Authentication APIs
 */

/**
 * @swagger
 * /api/finance-admin/login:
 *   post:
 *     summary: FinanceAdmin login
 *     tags: [FinanceAdmin]
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
 *                 example: financeadmin@olacars.com
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
 * /api/finance-admin/refresh:
 *   post:
 *     summary: Refresh access token
 *     tags: [FinanceAdmin]
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
 * /api/finance-admin:
 *   post:
 *     summary: Create new Finance Admin
 *     tags: [FinanceAdmin]
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
 *         description: Finance Admin created successfully
 */
router.post(
    "/",
    authenticate,
    authorize(ROLES.ADMIN),
    validate(addFinanceAdminSchema),
    addFinanceAdmin
);

/**
 * @swagger
 * /api/finance-admin:
 *   get:
 *     summary: Get all Finance Admins
 *     tags: [FinanceAdmin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of Finance Admins
 */
router.get(
    "/",
    authenticate,
    authorize(ROLES.ADMIN),
    getFinanceAdmins
);

/**
 * @swagger
 * /api/finance-admin/{id}:
 *   get:
 *     summary: Get Finance Admin by ID
 *     tags: [FinanceAdmin]
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
 *         description: Finance Admin details
 */
router.get(
    "/:id",
    authenticate,
    authorize(ROLES.ADMIN),
    validate(getFinanceAdminByIdSchema),
    getFinanceAdminById
);

/**
 * @swagger
 * /api/finance-admin/{id}:
 *   put:
 *     summary: Update a Finance Admin
 *     tags: [FinanceAdmin]
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
 *         description: Finance Admin updated successfully
 */
router.put(
    "/:id",
    authenticate,
    authorize(ROLES.ADMIN),
    validate(editFinanceAdminSchema),
    editFinanceAdmin
);

/**
 * @swagger
 * /api/finance-admin/{id}/change-password:
 *   post:
 *     summary: Change Finance Admin password
 *     tags: [FinanceAdmin]
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
 * /api/finance-admin/{id}:
 *   delete:
 *     summary: Soft Delete a Finance Admin
 *     tags: [FinanceAdmin]
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
 *         description: Finance Admin deleted successfully
 */
router.delete(
    "/:id",
    authenticate,
    authorize(ROLES.ADMIN),
    validate(deleteFinanceAdminSchema),
    deleteFinanceAdmin
);

module.exports = router;
