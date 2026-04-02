const express = require("express");
const router = express.Router();
const {
    createPartHandler,
    getPartsHandler,
    getPartByIdHandler,
    updatePartHandler,
    deletePartHandler,
    restockPartHandler,
    reserveStockHandler,
    releaseStockHandler,
    installPartHandler,
    getLowStockHandler,
    getPartTransactionsHandler,
    getWorkshopRequirementsHandler,
} = require("../Controller/InventoryController");
const { authenticate } = require("../../../shared/middlewares/authMiddleware.js");
const { authorize } = require("../../../shared/middlewares/roleMiddleWare.js");
const { ROLES } = require("../../../shared/constants/roles.js");

/**
 * @swagger
 * tags:
 *   name: Inventory
 *   description: Inventory & Parts Management APIs
 */

/**
 * @swagger
 * /api/inventory:
 *   post:
 *     summary: Create a new inventory part
 *     tags: [Inventory]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - partName
 *               - partNumber
 *               - category
 *               - unitCost
 *               - branchId
 *             properties:
 *               partName:
 *                 type: string
 *               partNumber:
 *                 type: string
 *               category:
 *                 type: string
 *                 enum: [Engine, Transmission, Brakes, Suspension, Electrical, Body, Tyres, Fluids, Filters, Belts, Cooling, Exhaust, Interior, Other]
 *               unitCost:
 *                 type: number
 *               branchId:
 *                 type: string
 *               unit:
 *                 type: string
 *                 enum: [piece, litre, kg, metre, set, pair, box]
 *               quantityOnHand:
 *                 type: number
 *               reorderLevel:
 *                 type: number
 *               supplierId:
 *                 type: string
 *               description:
 *                 type: string
 *     responses:
 *       201:
 *         description: Part created
 *       409:
 *         description: Duplicate part number
 */
router.post(
    "/",
    authenticate,
    authorize(ROLES.WORKSHOPSTAFF, ROLES.OPERATIONSTAFF, ROLES.BRANCHMANAGER, ROLES.ADMIN, ROLES.WORKSHOPMANAGER),
    createPartHandler
);

/**
 * @swagger
 * /api/inventory:
 *   get:
 *     summary: Get all inventory parts (supports filtering)
 *     tags: [Inventory]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: branchId
 *         schema:
 *           type: string
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *       - in: query
 *         name: supplierId
 *         schema:
 *           type: string
 *       - in: query
 *         name: lowStock
 *         schema:
 *           type: string
 *           enum: ["true", "false"]
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by part name or number
 *     responses:
 *       200:
 *         description: List of parts
 */
router.get("/", authenticate, getPartsHandler);

/**
 * @swagger
 * /api/inventory/low-stock/{branchId}:
 *   get:
 *     summary: Get low-stock parts for a specific branch
 *     tags: [Inventory]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: branchId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of low-stock parts
 */
router.get("/low-stock/:branchId", authenticate, getLowStockHandler);

/**
 * @swagger
 * /api/inventory/{id}:
 *   get:
 *     summary: Get a single part by ID
 *     tags: [Inventory]
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
 *         description: Part details
 *       404:
 *         description: Part not found
 */
router.get("/:id", authenticate, getPartByIdHandler);

/**
 * @swagger
 * /api/inventory/{id}:
 *   put:
 *     summary: Update a part
 *     tags: [Inventory]
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
 *               partName:
 *                 type: string
 *               unitCost:
 *                 type: number
 *               reorderLevel:
 *                 type: number
 *               description:
 *                 type: string
 *     responses:
 *       200:
 *         description: Part updated
 */
router.put(
    "/:id",
    authenticate,
    authorize(ROLES.WORKSHOPSTAFF, ROLES.OPERATIONSTAFF, ROLES.BRANCHMANAGER, ROLES.ADMIN, ROLES.WORKSHOPMANAGER),
    updatePartHandler
);

/**
 * @swagger
 * /api/inventory/{id}:
 *   delete:
 *     summary: Soft-delete (deactivate) a part
 *     tags: [Inventory]
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
 *         description: Part deactivated
 */
router.delete(
    "/:id",
    authenticate,
    authorize(ROLES.BRANCHMANAGER, ROLES.ADMIN, ROLES.WORKSHOPMANAGER),
    deletePartHandler
);

/**
 * @swagger
 * /api/inventory/{id}/restock:
 *   put:
 *     summary: Restock a part (add quantity)
 *     tags: [Inventory]
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
 *               - quantity
 *             properties:
 *               quantity:
 *                 type: number
 *                 minimum: 1
 *     responses:
 *       200:
 *         description: Part restocked
 */
router.put(
    "/:id/restock",
    authenticate,
    authorize(ROLES.WORKSHOPSTAFF, ROLES.OPERATIONSTAFF, ROLES.BRANCHMANAGER, ROLES.ADMIN, ROLES.WORKSHOPMANAGER),
    restockPartHandler
);

/**
 * @swagger
 * /api/inventory/{id}/reserve:
 *   put:
 *     summary: Reserve stock for a work order
 *     tags: [Inventory]
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
 *               - quantity
 *             properties:
 *               quantity:
 *                 type: number
 *                 minimum: 1
 *     responses:
 *       200:
 *         description: Stock reserved
 *       400:
 *         description: Insufficient stock
 */
router.put(
    "/:id/reserve",
    authenticate,
    authorize(ROLES.WORKSHOPSTAFF, ROLES.OPERATIONSTAFF, ROLES.BRANCHMANAGER, ROLES.ADMIN, ROLES.WORKSHOPMANAGER),
    reserveStockHandler
);

/**
 * @swagger
 * /api/inventory/{id}/release:
 *   put:
 *     summary: Release reserved stock
 *     tags: [Inventory]
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
 *               - quantity
 *             properties:
 *               quantity:
 *                 type: number
 *     responses:
 *       200:
 *         description: Stock released
 */
router.put(
    "/:id/release",
    authenticate,
    authorize(ROLES.WORKSHOPSTAFF, ROLES.OPERATIONSTAFF, ROLES.BRANCHMANAGER, ROLES.ADMIN, ROLES.WORKSHOPMANAGER),
    releaseStockHandler
);

/**
 * @swagger
 * /api/inventory/{id}/install:
 *   put:
 *     summary: Confirm part installation (deducts stock)
 *     tags: [Inventory]
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
 *               - quantity
 *             properties:
 *               quantity:
 *                 type: number
 *     responses:
 *       200:
 *         description: Stock deducted after installation
 */
router.put(
    "/:id/install",
    authenticate,
    authorize(ROLES.WORKSHOPSTAFF, ROLES.OPERATIONSTAFF, ROLES.BRANCHMANAGER, ROLES.ADMIN, ROLES.WORKSHOPMANAGER),
    installPartHandler
);

/**
 * @swagger
 * /api/inventory/{id}/transactions:
 *   get:
 *     summary: Get transaction history for a part
 *     tags: [Inventory]
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
 *         description: List of transactions
 */
router.get(
    "/:id/transactions",
    authenticate,
    authorize(ROLES.WORKSHOPSTAFF, ROLES.OPERATIONSTAFF, ROLES.BRANCHMANAGER, ROLES.ADMIN, ROLES.WORKSHOPMANAGER),
    getPartTransactionsHandler
);

/**
 * @swagger
 * /api/inventory/workshop-requirements/{branchId}:
 *   get:
 *     summary: Get all pending part requirements for a workshop (branch)
 *     tags: [Inventory]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: branchId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of pending parts from active work orders
 */
router.get(
    "/workshop-requirements/:branchId",
    authenticate,
    authorize(ROLES.WORKSHOPSTAFF, ROLES.OPERATIONSTAFF, ROLES.BRANCHMANAGER, ROLES.ADMIN, ROLES.WORKSHOPMANAGER),
    getWorkshopRequirementsHandler
);

module.exports = router;
