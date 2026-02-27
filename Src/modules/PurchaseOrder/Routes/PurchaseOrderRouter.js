const express = require("express");
const router = express.Router();
const {
    addPurchaseOrder,
    getPurchaseOrders,
    getPurchaseOrderById,
    approvePurchaseOrder,
    editPurchaseOrder,
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
 *               - items
 *               - branch
 *               - supplier
 *             properties:
 *               items:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required:
 *                     - itemName
 *                     - unitPrice
 *                   properties:
 *                     itemName:
 *                       type: string
 *                     quantity:
 *                       type: number
 *                     description:
 *                       type: string
 *                     unitPrice:
 *                       type: number
 *               paymentDate:
 *                 type: string
 *                 format: date-time
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

/**
 * @swagger
 * /api/purchase-order/{id}:
 *   put:
 *     summary: Edit a Purchase Order (resetting it to WAITING)
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
 *     responses:
 *       200:
 *         description: PO edited successfully
 */
router.put(
    "/:id",
    authenticate,
    authorize(ROLES.BRANCHMANAGER, ROLES.OPERATIONSTAFF, ROLES.FINANCESTAFF, ROLES.ADMIN),
    editPurchaseOrder
);

module.exports = router;
