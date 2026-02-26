const express = require("express");
const router = express.Router();
const {
    login,
    refreshToken,
    addAdmin,
    getAdmins,
    getAdminById,
    editAdmin,
    deleteAdmin
} = require("../Controller/AdminController.js");
const { authenticate } = require("../../../shared/middlewares/authMiddleware.js");
const { authorize } = require("../../../shared/middlewares/roleMiddleWare.js");
const { ROLES } = require("../../../shared/constants/roles.js");

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
router.post("/login", login);

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
 *     responses:
 *       201:
 *         description: Admin created successfully
 */
router.post(
    "/",
    authenticate,
    authorize(ROLES.ADMIN),
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
    getAdminById
);

/**
 * @swagger
 * /api/admin/update:
 *   put:
 *     summary: Update an Admin
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
 *               - id
 *             properties:
 *               id:
 *                 type: string
 *     responses:
 *       200:
 *         description: Admin updated successfully
 */
router.put(
    "/update",
    authenticate,
    authorize(ROLES.ADMIN),
    editAdmin
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
    deleteAdmin
);

module.exports = router;