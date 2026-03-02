const express = require("express");
const router = express.Router();
const {
    addBranchManager,
    editBranchManager,
    changePassword,
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
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Login successful
 */
router.post("/login", login);

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
 *               password:
 *                 type: string
 *               phone:
 *                 type: string
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
    getBranchManagerById
);

/**
 * @swagger
 * /api/branch-manager/update:
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
 *               newPassword:
 *                 type: string
 *     responses:
 *       200:
 *         description: Password changed successfully
 */
router.post(
    "/:id/change-password",
    authenticate,
    authorize(ROLES.ADMIN, ROLES.OPERATIONADMIN, ROLES.FINANCEADMIN, ROLES.COUNTRYMANAGER),
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
    deleteBranchManager
);

module.exports = router;
