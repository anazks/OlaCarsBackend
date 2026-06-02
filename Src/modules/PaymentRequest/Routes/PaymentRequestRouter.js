const express = require("express");
const router = express.Router();
const {
    createPaymentRequest,
    getPaymentRequests,
    getPaymentRequestById,
    updateStatus,
    deletePaymentRequest,
} = require("../Controller/PaymentRequestController");
const { authenticate } = require("../../../shared/middlewares/authMiddleware.js");
const { authorize } = require("../../../shared/middlewares/roleMiddleWare.js");
const { ROLES } = require("../../../shared/constants/roles.js");
const upload = require("../../../utils/multerConfig");

/**
 * @swagger
 * tags:
 *   name: PaymentRequest
 *   description: Payment Request Management (Country Manager → Financial Admin)
 */

/**
 * POST /api/payment-requests
 * Country Manager submits a payment request to Financial Admin
 */
router.post(
    "/",
    authenticate,
    authorize(ROLES.COUNTRYMANAGER, ROLES.ADMIN),
    upload.single("supportingDocument"),
    createPaymentRequest
);

/**
 * GET /api/payment-requests
 * Country Manager sees own requests; Financial Admin sees all
 */
router.get(
    "/",
    authenticate,
    authorize(
        ROLES.COUNTRYMANAGER,
        ROLES.FINANCEADMIN,
        ROLES.ADMIN,
        ROLES.OPERATIONADMIN
    ),
    getPaymentRequests
);

/**
 * GET /api/payment-requests/:id
 */
router.get(
    "/:id",
    authenticate,
    authorize(
        ROLES.COUNTRYMANAGER,
        ROLES.FINANCEADMIN,
        ROLES.ADMIN,
        ROLES.OPERATIONADMIN
    ),
    getPaymentRequestById
);

/**
 * PATCH /api/payment-requests/:id/status
 * Financial Admin reviews and updates status
 */
router.patch(
    "/:id/status",
    authenticate,
    authorize(ROLES.FINANCEADMIN, ROLES.ADMIN),
    updateStatus
);

/**
 * DELETE /api/payment-requests/:id
 * Only the creator can delete INITIATED requests
 */
router.delete(
    "/:id",
    authenticate,
    authorize(ROLES.COUNTRYMANAGER, ROLES.ADMIN),
    deletePaymentRequest
);

module.exports = router;
