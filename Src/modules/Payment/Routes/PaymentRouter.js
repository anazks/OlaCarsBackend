const express = require("express");
const router = express.Router();
const {
    addPaymentTransaction,
    getPaymentTransactions,
    getPaymentTransactionById,
    updatePaymentStatus,
} = require("../Controller/PaymentTransactionController");
const { authenticate } = require("../../../shared/middlewares/authMiddleware");
const { hasPermission } = require("../../../shared/middlewares/permissionMiddleware");

// Depending on the organization's rules, adding a payment might be restricted.
// Assuming authenticate is enough for now, role middleware can be added if needed based on the matrix.

/**
 * @swagger
 * tags:
 *   name: PaymentTransaction
 *   description: Payment Transactions APIs
 */

/**
 * @swagger
 * /api/payment:
 *   post:
 *     summary: Create new Payment Transaction
 *     tags: [PaymentTransaction]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - accountingCode
 *               - referenceId
 *               - referenceModel
 *               - transactionCategory
 *               - transactionType
 *               - baseAmount
 *               - totalAmount
 *               - paymentMethod
 *             properties:
 *               accountingCode:
 *                 type: string
 *               referenceId:
 *                 type: string
 *               referenceModel:
 *                 type: string
 *                 enum: [PurchaseOrder]
 *               transactionCategory:
 *                 type: string
 *                 enum: [INCOME, EXPENSE, LIABILITY, ASSET, EQUITY]
 *               transactionType:
 *                 type: string
 *                 enum: [CREDIT, DEBIT]
 *               isTaxInclusive:
 *                 type: boolean
 *               baseAmount:
 *                 type: number
 *               taxApplied:
 *                 type: string
 *               taxAmount:
 *                 type: number
 *               totalAmount:
 *                 type: number
 *               paymentMethod:
 *                 type: string
 *                 enum: [CASH, BANK_TRANSFER, CREDIT_CARD, CHEQUE, OTHER]
 *               status:
 *                 type: string
 *                 enum: [PENDING, COMPLETED, FAILED, CANCELLED]
 *               notes:
 *                 type: string
 *     responses:
 *       201:
 *         description: Payment Transaction created successfully
 */
router.post("/", authenticate, hasPermission("PAYMENT_CREATE"), addPaymentTransaction);

/**
 * @swagger
 * /api/payment:
 *   get:
 *     summary: Get all Payment Transactions
 *     tags: [PaymentTransaction]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of Payment Transactions
 */
router.get("/", authenticate, hasPermission("PAYMENT_VIEW"), getPaymentTransactions);

/**
 * @swagger
 * /api/payment/{id}:
 *   get:
 *     summary: Get Payment Transaction by ID
 *     tags: [PaymentTransaction]
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
 *         description: Payment Transaction details
 */
router.get("/:id", authenticate, hasPermission("PAYMENT_VIEW"), getPaymentTransactionById);

/**
 * @swagger
 * /api/payment/{id}/status:
 *   put:
 *     summary: Update Payment Transaction status
 *     tags: [PaymentTransaction]
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
 *                 enum: [PENDING, COMPLETED, FAILED, CANCELLED]
 *     responses:
 *       200:
 *         description: Payment Transaction status updated successfully
 */
router.put("/:id/status", authenticate, hasPermission("PAYMENT_APPROVE"), updatePaymentStatus);

module.exports = router;
