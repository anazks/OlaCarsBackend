const express = require("express");
const router = express.Router();
const {
    addOperationStaff,
    editOperationStaff,
    deleteOperationStaff,
    getOperationStaff,
    getOperationStaffById,
    login
} = require("../Controller/OperationStaffController.js");
const { authorize } = require("../../../shared/middlewares/roleMiddleWare.js");
const { authenticate } = require("../../../shared/middlewares/authMiddleware.js");
const { ROLES } = require("../../../shared/constants/roles.js");

/**
 * @swagger
 * tags:
 *   name: OperationStaff
 *   description: Operation Staff APIs
 */

/**
 * @swagger
 * /api/operationstaff/login:
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
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Login successful
 */
router.post("/login", login);

/**
 * @swagger
 * /api/operationstaff:
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
    authorize(ROLES.BRANCHMANAGER, ROLES.ADMIN, ROLES.OPERATIONADMIN),
    addOperationStaff
);

/**
 * @swagger
 * /api/operationstaff:
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
    authorize(ROLES.BRANCHMANAGER, ROLES.ADMIN, ROLES.OPERATIONADMIN),
    getOperationStaff
);

/**
 * @swagger
 * /api/operationstaff/{id}:
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
    authorize(ROLES.BRANCHMANAGER, ROLES.ADMIN, ROLES.OPERATIONADMIN),
    getOperationStaffById
);

/**
 * @swagger
 * /api/operationstaff/update:
 *   put:
 *     summary: Update Operation Staff
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
 *               - id
 *             properties:
 *               id:
 *                 type: string
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
    "/update",
    authenticate,
    authorize(ROLES.BRANCHMANAGER, ROLES.ADMIN, ROLES.OPERATIONADMIN),
    editOperationStaff
);

/**
 * @swagger
 * /api/operationstaff/{id}:
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
    deleteOperationStaff
);

module.exports = router;
