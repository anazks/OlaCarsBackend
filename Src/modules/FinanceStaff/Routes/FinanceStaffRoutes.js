const express = require("express");
const router = express.Router();
const {
    addFinanceStaff,
    editFinanceStaff,
    deleteFinanceStaff,
    getFinanceStaff,
    getFinanceStaffById,
    login
} = require("../Controller/FinanceStaffController.js");
const { authorize } = require("../../../shared/middlewares/roleMiddleWare.js");
const { authenticate } = require("../../../shared/middlewares/authMiddleware.js");
const { ROLES } = require("../../../shared/constants/roles.js");

/**
 * @swagger
 * tags:
 *   name: FinanceStaff
 *   description: Finance Staff APIs
 */

/**
 * @swagger
 * /api/financestaff/login:
 *   post:
 *     summary: Finance Staff login
 *     tags: [FinanceStaff]
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
router.post("/login", login);

/**
 * @swagger
 * /api/financestaff:
 *   post:
 *     summary: Create new Finance Staff
 *     tags: [FinanceStaff]
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
 *     responses:
 *       201:
 *         description: Staff created successfully
 */
router.post(
    "/",
    authenticate,
    authorize(ROLES.BRANCHMANAGER, ROLES.ADMIN, ROLES.FINANCEADMIN),
    addFinanceStaff
);

/**
 * @swagger
 * /api/financestaff:
 *   get:
 *     summary: Get all Finance Staff
 *     tags: [FinanceStaff]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of Staff
 */
router.get(
    "/",
    authenticate,
    authorize(ROLES.BRANCHMANAGER, ROLES.ADMIN, ROLES.FINANCEADMIN),
    getFinanceStaff
);

/**
 * @swagger
 * /api/financestaff/{id}:
 *   get:
 *     summary: Get Finance Staff by ID
 *     tags: [FinanceStaff]
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
    authorize(ROLES.BRANCHMANAGER, ROLES.ADMIN, ROLES.FINANCEADMIN),
    getFinanceStaffById
);

/**
 * @swagger
 * /api/financestaff/update:
 *   put:
 *     summary: Update Finance Staff
 *     tags: [FinanceStaff]
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
 *         description: Staff updated successfully
 */
router.put(
    "/update",
    authenticate,
    authorize(ROLES.BRANCHMANAGER, ROLES.ADMIN, ROLES.FINANCEADMIN),
    editFinanceStaff
);

/**
 * @swagger
 * /api/financestaff/{id}:
 *   delete:
 *     summary: Soft Delete Finance Staff
 *     tags: [FinanceStaff]
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
    authorize(ROLES.BRANCHMANAGER, ROLES.ADMIN, ROLES.FINANCEADMIN),
    deleteFinanceStaff
);

module.exports = router;
