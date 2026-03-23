const express = require("express");
const router = express.Router();
const {
    login,
    refreshToken,
    addAdmin,
    getAdmins,
    getAdminById,
    editAdmin,
    changePassword,
    deleteAdmin
} = require("../Controller/AdminController.js");
const { authenticate } = require("../../../shared/middlewares/authMiddleware.js");
const { authorize } = require("../../../shared/middlewares/roleMiddleWare.js");
const { ROLES } = require("../../../shared/constants/roles.js");
const validate = require("../../../shared/middlewares/validate.js");
const {
    loginSchema,
    addAdminSchema,
    editAdminSchema,
    changePasswordSchema,
    deleteAdminSchema,
    getAdminByIdSchema,
} = require("../Validation/AdminValidation.js");

/**
 * @swagger
 * tags:
 *   name: Admin
 *   description: Admin Authentication APIs
 */

/**
 * @swagger
 * /api/admin/login:
 *   post:
 *     summary: Admin login
 *     tags: [Admin]
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
 *                 example: admin@olacars.com
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
 * /api/admin/refresh:
 *   post:
 *     summary: Refresh access token
 *     tags: [Admin]
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
 * /api/admin:
 *   post:
 *     summary: Create new Admin
 *     tags: [Admin]
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
 *     responses:
 *       201:
 *         description: Admin created successfully
 */
router.post(
    "/",
    authenticate,
    authorize(ROLES.ADMIN),
    validate(addAdminSchema),
    addAdmin
);

/**
 * @swagger
 * /api/admin:
 *   get:
 *     summary: Get all Admins
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of Admins
 */
router.get(
    "/",
    authenticate,
    authorize(ROLES.ADMIN),
    getAdmins
);

/**
 * @swagger
 * /api/admin/{id}:
 *   get:
 *     summary: Get Admin by ID
 *     tags: [Admin]
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
 *         description: Admin details
 */
router.get(
    "/:id",
    authenticate,
    authorize(ROLES.ADMIN),
    validate(getAdminByIdSchema),
    getAdminById
);

/**
 * @swagger
 * /api/admin/{id}:
 *   put:
 *     summary: Update an Admin (whitelisted fields only)
 *     tags: [Admin]
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
 *               status:
 *                 type: string
 *                 enum: [ACTIVE, SUSPENDED, LOCKED]
 *               twoFactorEnabled:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Admin updated successfully
 */
router.put(
    "/:id",
    authenticate,
    authorize(ROLES.ADMIN),
    validate(editAdminSchema),
    editAdmin
);

/**
 * @swagger
 * /api/admin/{id}/change-password:
 *   post:
 *     summary: Change Admin password
 *     tags: [Admin]
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
 *       401:
 *         description: Current password incorrect
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
 * /api/admin/{id}:
 *   delete:
 *     summary: Soft Delete an Admin
 *     tags: [Admin]
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
 *         description: Admin deleted successfully
 */
router.delete(
    "/:id",
    authenticate,
    authorize(ROLES.ADMIN),
    validate(deleteAdminSchema),
    deleteAdmin
);

module.exports = router;