const express = require("express");
const router = express.Router();
const {
    addPurchaseOrder,
    getPurchaseOrders,
    getPurchaseOrderById,
    approvePurchaseOrder,
} = require("../Controller/PurchaseOrderController.js");
const { authenticate } = require("../../../shared/middlewares/authMiddleware.js");
const { authorize } = require("../../../shared/middlewares/roleMiddleWare.js");
const { ROLES } = require("../../../shared/constants/roles.js");

/**
 * @swagger
 * tags:
 *   name: PurchaseOrder
 *   description: Purchase Order Management APIs
 */

/**
 * @swagger
 * /api/purchase-order:
 *   post:
 *     summary: Create new Purchase Order
 *     tags: [PurchaseOrder]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - priceOfVehicle
 *               - vehicleNumber
 *               - branch
 *               - supplier
 *             properties:
 *               priceOfVehicle:
 *                 type: number
 *               vehicleNumber:
 *                 type: string
 *               branch:
 *                 type: string
 *               supplier:
 *                 type: string
 *     responses:
 *       201:
 *         description: PO created successfully
 */
router.post(
    "/",
    authenticate,
    authorize(ROLES.BRANCHMANAGER, ROLES.OPERATIONSTAFF, ROLES.FINANCESTAFF),
    addPurchaseOrder
);

/**
 * @swagger
 * /api/purchase-order:
 *   get:
 *     summary: Get all Purchase Orders
 *     tags: [PurchaseOrder]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of POs
 */
router.get(
    "/",
    authenticate,
    getPurchaseOrders
);

/**
 * @swagger
 * /api/purchase-order/{id}:
 *   get:
 *     summary: Get Purchase Order by ID
 *     tags: [PurchaseOrder]
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
 *         description: PO details
 */
router.get(
    "/:id",
    authenticate,
    getPurchaseOrderById
);

/**
 * @swagger
 * /api/purchase-order/{id}/approve:
 *   put:
 *     summary: Approve/Reject Purchase Order
 *     tags: [PurchaseOrder]
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
 *               - status
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [APPROVED, REJECTED]
 *     responses:
 *       200:
 *         description: PO status updated successfully
 */
router.put(
    "/:id/approve",
    authenticate,
    authorize(ROLES.ADMIN, ROLES.FINANCEADMIN, ROLES.OPERATIONADMIN, ROLES.COUNTRYMANAGER),
    approvePurchaseOrder
);

module.exports = router;
