const express = require("express");
const router = express.Router();

const { addBranch, editBranch, deleteBranch, getBranches, getBranchById } = require("../Controller/BranchController.js");
const { authorize } = require("../../../shared/middlewares/roleMiddleWare.js");
const { authenticate } = require("../../../shared/middlewares/authMiddleware.js");
const { ROLES } = require("../../../shared/constants/roles.js");

/**
 * @swagger
 * tags:
 *   name: Branch
 *   description: Branch Management APIs
 */

/**
 * @swagger
 * /api/branch/:
 *   post:
 *     summary: Create new branch
 *     tags: [Branch]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - code
 *               - address
 *               - city
 *               - state
 *               - phone
 *             properties:
 *               name:
 *                 type: string
 *                 example: Kochi Main Branch
 *               code:
 *                 type: string
 *                 example: KOCHI01
 *               address:
 *                 type: string
 *               city:
 *                 type: string
 *               state:
 *                 type: string
 *               phone:
 *                 type: string
 *               email:
 *                 type: string
 *               createdBy:
 *                 type: string
 *               creatorRole:
 *                 type: string
 *                 enum: [ADMIN, OPERATIONADMIN, FINANCEADMIN, COUNTRYMANAGER]
 *               status:
 *                 type: string
 *                 enum: [ACTIVE, INACTIVE]
 *     responses:
 *       201:
 *         description: Branch created successfully
 *       403:
 *         description: Forbidden
 */
router.post(
  "/",
  authenticate,
  authorize(ROLES.ADMIN, ROLES.OPERATIONADMIN, ROLES.FINANCEADMIN, ROLES.COUNTRYMANAGER),
  addBranch
);

/**
 * @swagger
 * /api/branch/:
 *   get:
 *     summary: Get all branches
 *     tags: [Branch]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of branches
 */
router.get(
  "/",
  authenticate,
  authorize(ROLES.ADMIN, ROLES.OPERATIONADMIN, ROLES.FINANCEADMIN, ROLES.COUNTRYMANAGER, ROLES.BRANCHMANAGER, ROLES.FINANCESTAFF, ROLES.OPERATIONSTAFF),
  getBranches
);

/**
 * @swagger
 * /api/branch/{id}:
 *   get:
 *     summary: Get branch by ID
 *     tags: [Branch]
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
 *         description: Branch details
 */
router.get(
  "/:id",
  authenticate,
  authorize(ROLES.ADMIN, ROLES.OPERATIONADMIN, ROLES.FINANCEADMIN, ROLES.COUNTRYMANAGER),
  getBranchById
);

/**
 * @swagger
 *  /api/branch/:
 *   put:
 *     summary: Update branch
 *     tags: [Branch]
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
 *               name:
 *                 type: string
 *               code:
 *                 type: string
 *               address:
 *                 type: string
 *               city:
 *                 type: string
 *               state:
 *                 type: string
 *               phone:
 *                 type: string
 *               email:
 *                 type: string
 *               createdBy:
 *                 type: string
 *               creatorRole:
 *                 type: string
 *                 enum: [ADMIN, OPERATIONADMIN, FINANCEADMIN, COUNTRYMANAGER]
 *               status:
 *                 type: string
 *                 enum: [ACTIVE, INACTIVE]
 *     responses:
 *       200:
 *         description: Branch updated successfully
 */
router.put(
  "/",
  authenticate,
  authorize(ROLES.ADMIN, ROLES.OPERATIONADMIN, ROLES.FINANCEADMIN, ROLES.COUNTRYMANAGER),
  editBranch
);

/**
 * @swagger
 * /api/branch/{id}:
 *   delete:
 *     summary: Delete branch
 *     tags: [Branch]
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
 *         description: Branch deleted successfully
 */
router.delete(
  "/:id",
  authenticate,
  authorize(ROLES.ADMIN, ROLES.OPERATIONADMIN, ROLES.FINANCEADMIN, ROLES.COUNTRYMANAGER),
  deleteBranch
);

module.exports = router;