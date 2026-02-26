const express = require("express");
const router = express.Router();
const {
    login,
    refreshToken,
    addFinanceAdmin,
    getFinanceAdmins,
    getFinanceAdminById,
    editFinanceAdmin,
    deleteFinanceAdmin
} = require("../Controller/FinanceAdminController.js");
const { authenticate } = require("../../../shared/middlewares/authMiddleware.js");
const { authorize } = require("../../../shared/middlewares/roleMiddleWare.js");
const { ROLES } = require("../../../shared/constants/roles.js");

/**
 * @swagger
 * tags:
 *   name: FinanceAdmin
 *   description: FinanceAdmin Authentication APIs
 */

/**
 * @swagger
 * /api/financeadmin/login:
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
router.post("/login", login);

/**
 * @swagger
 * /api/financeadmin/refresh:
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
 * /api/financeadmin:
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
 *     responses:
 *       201:
 *         description: Finance Admin created successfully
 */
router.post(
    "/",
    authenticate,
    authorize(ROLES.ADMIN),
    addFinanceAdmin
);

/**
 * @swagger
 * /api/financeadmin:
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
 * /api/financeadmin/{id}:
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
    getFinanceAdminById
);

/**
 * @swagger
 * /api/financeadmin/update:
 *   put:
 *     summary: Update a Finance Admin
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
 *               - id
 *             properties:
 *               id:
 *                 type: string
 *     responses:
 *       200:
 *         description: Finance Admin updated successfully
 */
router.put(
    "/update",
    authenticate,
    authorize(ROLES.ADMIN),
    editFinanceAdmin
);

/**
 * @swagger
 * /api/financeadmin/{id}:
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
    deleteFinanceAdmin
);

module.exports = router;
