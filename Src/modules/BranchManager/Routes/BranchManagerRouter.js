const express = require("express");
const router = express.Router();
const {
    addBranchManager,
    editBranchManager,
    deleteBranchManager,
    getBranchManagers,
    getBranchManagerById,
    login
} = require("../Controller/BranchManagerController.js");
const { authorize } = require("../../../shared/middlewares/roleMiddleWare.js");
const { authenticate } = require("../../../shared/middlewares/authMiddleware.js");
const { ROLES } = require("../../../shared/constants/roles.js");

/**
 * @swagger
 * tags:
 *   name: BranchManager
 *   description: Branch Manager Management APIs
 */

/**
 * @swagger
 * /api/branchmanager/login:
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
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Login successful
 */
router.post("/login", login);

/**
 * @swagger
 * /api/branchmanager:
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
 *               password:
 *                 type: string
 *               phone:
 *                 type: string
 *               branchId:
 *                 type: string
 *     responses:
 *       201:
 *         description: Branch Manager created successfully
 */
router.post(
    "/",
    authenticate,
    authorize(ROLES.ADMIN, ROLES.OPERATIONADMIN, ROLES.FINANCEADMIN, ROLES.COUNTRYMANAGER),
    addBranchManager
);

/**
 * @swagger
 * /api/branchmanager:
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
    getBranchManagers
);

/**
 * @swagger
 * /api/branchmanager/{id}:
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
    getBranchManagerById
);

/**
 * @swagger
 * /api/branchmanager/update:
 *   put:
 *     summary: Update Branch Manager
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
 *               - id
 *             properties:
 *               id:
 *                 type: string
 *     responses:
 *       200:
 *         description: Branch Manager updated successfully
 */
router.put(
    "/update",
    authenticate,
    authorize(ROLES.ADMIN, ROLES.OPERATIONADMIN, ROLES.FINANCEADMIN, ROLES.COUNTRYMANAGER),
    editBranchManager
);

/**
 * @swagger
 * /api/branchmanager/{id}:
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
    deleteBranchManager
);

module.exports = router;
