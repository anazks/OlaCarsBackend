const express = require("express");
const router = express.Router();
const {
    createPaymentRequest,
    getPaymentRequests,
    getPaymentRequestById,
    updatePaymentRequestStatus,
    deletePaymentRequest,
} = require("../Controller/PaymentRequestController");

const { authenticate } = require("../../../shared/middlewares/authMiddleware");
const { authorize } = require("../../../shared/middlewares/roleMiddleWare");
const { ROLES } = require("../../../shared/constants/roles");
const upload = require("../../../utils/multerConfig");

// ── Routes ───────────────────────────────────────────────────────────────────

// POST /api/payment-requests - Submit new payment request
router.post(
    "/",
    authenticate,
    upload.single("supportingDocument"),
    createPaymentRequest
);

// GET /api/payment-requests - Get all payment requests (filtered by role/filters)
router.get(
    "/",
    authenticate,
    getPaymentRequests
);

// GET /api/payment-requests/:id - Get a single payment request
router.get(
    "/:id",
    authenticate,
    getPaymentRequestById
);

// PATCH /api/payment-requests/:id/status - Update status (Finance Admin & Admin only)
router.patch(
    "/:id/status",
    authenticate,
    authorize(ROLES.ADMIN, ROLES.FINANCEADMIN),
    updatePaymentRequestStatus
);

// DELETE /api/payment-requests/:id - Delete payment request (only creator, only INITIATED)
router.delete(
    "/:id",
    authenticate,
    deletePaymentRequest
);

module.exports = router;
