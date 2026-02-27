const express = require("express");
const router = express.Router();
const {
    addPaymentTransaction,
    getPaymentTransactions,
    getPaymentTransactionById,
    updatePaymentStatus,
} = require("../Controller/PaymentTransactionController");
const { authenticate } = require("../../../shared/middlewares/authMiddleware");

// Depending on the organization's rules, adding a payment might be restricted.
// Assuming authenticate is enough for now, role middleware can be added if needed based on the matrix.

/**
 * @swagger
 * tags:
 *   name: PaymentTransaction
 *   description: Payment Transactions APIs
 */

router.post("/", authenticate, addPaymentTransaction);
router.get("/", authenticate, getPaymentTransactions);
router.get("/:id", authenticate, getPaymentTransactionById);
router.put("/:id/status", authenticate, updatePaymentStatus);

module.exports = router;
