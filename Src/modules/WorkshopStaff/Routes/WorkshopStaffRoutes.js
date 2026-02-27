const express = require("express");
const router = express.Router();
const {
    addWorkshopStaff,
    editWorkshopStaff,
    deleteWorkshopStaff,
    getWorkshopStaff,
    getWorkshopStaffById,
    login
} = require("../Controller/WorkshopStaffController.js");
const { authorize } = require("../../../shared/middlewares/roleMiddleWare.js");
const { authenticate } = require("../../../shared/middlewares/authMiddleware.js");
const { ROLES } = require("../../../shared/constants/roles.js");

/**
 * @swagger
 * tags:
 *   name: WorkshopStaff
 *   description: Workshop Staff APIs
 */

/**
 * @swagger
 * /api/workshopstaff/login:
 *   post:
 *     summary: Workshop Staff login
 *     tags: [WorkshopStaff]
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
 * /api/workshopstaff:
 *   post:
 *     summary: Create new Workshop Staff
 *     tags: [WorkshopStaff]
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
    authorize(ROLES.BRANCHMANAGER, ROLES.ADMIN, ROLES.OPERATIONADMIN, ROLES.COUNTRYMANAGER),
    addWorkshopStaff
);

/**
 * @swagger
 * /api/workshopstaff:
 *   get:
 *     summary: Get all Workshop Staff
 *     tags: [WorkshopStaff]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of Staff
 */
router.get(
    "/",
    authenticate,
    authorize(ROLES.BRANCHMANAGER, ROLES.ADMIN, ROLES.OPERATIONADMIN, ROLES.COUNTRYMANAGER),
    getWorkshopStaff
);

/**
 * @swagger
 * /api/workshopstaff/{id}:
 *   get:
 *     summary: Get Workshop Staff by ID
 *     tags: [WorkshopStaff]
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
    authorize(ROLES.BRANCHMANAGER, ROLES.ADMIN, ROLES.OPERATIONADMIN, ROLES.COUNTRYMANAGER),
    getWorkshopStaffById
);

/**
 * @swagger
 * /api/workshopstaff/update:
 *   put:
 *     summary: Update Workshop Staff
 *     tags: [WorkshopStaff]
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
    authorize(ROLES.BRANCHMANAGER, ROLES.ADMIN, ROLES.OPERATIONADMIN, ROLES.COUNTRYMANAGER),
    editWorkshopStaff
);

/**
 * @swagger
 * /api/workshopstaff/{id}:
 *   delete:
 *     summary: Soft Delete Workshop Staff
 *     tags: [WorkshopStaff]
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
    authorize(ROLES.BRANCHMANAGER, ROLES.ADMIN, ROLES.OPERATIONADMIN, ROLES.COUNTRYMANAGER),
    deleteWorkshopStaff
);

module.exports = router;
