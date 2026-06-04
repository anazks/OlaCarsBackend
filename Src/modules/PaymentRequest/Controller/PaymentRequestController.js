const service = require("../Service/PaymentRequestService");
const uploadLocal = require("../../../utils/uploadLocal");


/**
 * POST /api/payment-requests
 * Create a new payment request (Country Manager)
 */
const createPaymentRequest = async (req, res) => {
    try {
        const {
            amount,
            currency,
            reason,
            expectedPaymentDate,
            additionalNotes,
            category,
            country,
            branchId,
        } = req.body;

        if (!amount || !reason || !expectedPaymentDate) {
            return res.status(400).json({
                success: false,
                message: "amount, reason, and expectedPaymentDate are required.",
            });
        }

        // Handle optional file upload (memory storage - use uploadLocal)
        let supportingDocument;
        if (req.file) {
            const fileUrl = uploadLocal(req.file, "payment-requests");
            supportingDocument = {
                name: req.file.originalname,
                url: fileUrl,
                uploadedAt: new Date(),
            };
        }

        const pr = await service.createPaymentRequest({
            requestedBy: req.user.id,
            requestedByRole: req.user.role,
            country: country || req.user.country,
            branchId,
            amount: Number(amount),
            currency,
            reason,
            expectedPaymentDate,
            additionalNotes,
            category,
            supportingDocument,
        });

        return res.status(201).json({
            success: true,
            message: "Payment request submitted successfully.",
            data: pr,
        });
    } catch (err) {
        console.error("[PaymentRequest] createPaymentRequest error:", err);
        return res.status(500).json({ success: false, message: err.message });
    }
};

/**
 * GET /api/payment-requests
 * List all payment requests (Financial Admin sees all; Country Manager sees own)
 */
const getPaymentRequests = async (req, res) => {
    try {
        const filters = { ...req.query };

        // Country managers can only see their own requests
        if (req.user.role === "countrymanager" || req.user.role === "CountryManager") {
            filters.requestedBy = req.user.id;
        }

        const result = await service.getPaymentRequests(filters);

        return res.status(200).json({
            success: true,
            ...result,
        });
    } catch (err) {
        console.error("[PaymentRequest] getPaymentRequests error:", err);
        return res.status(500).json({ success: false, message: err.message });
    }
};

/**
 * GET /api/payment-requests/:id
 */
const getPaymentRequestById = async (req, res) => {
    try {
        const pr = await service.getPaymentRequestById(req.params.id);
        if (!pr) {
            return res.status(404).json({ success: false, message: "Payment request not found." });
        }
        return res.status(200).json({ success: true, data: pr });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
};

/**
 * PATCH /api/payment-requests/:id/status
 * Update status (Financial Admin only)
 */
const updateStatus = async (req, res) => {
    try {
        const { status, reviewNotes } = req.body;
        if (!status) {
            return res.status(400).json({ success: false, message: "status is required." });
        }

        const pr = await service.updateStatus(
            req.params.id,
            status,
            req.user.id,
            req.user.role,
            reviewNotes
        );

        return res.status(200).json({
            success: true,
            message: `Payment request status updated to ${status}.`,
            data: pr,
        });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
};

/**
 * DELETE /api/payment-requests/:id
 * Only INITIATED requests can be deleted, by the creator
 */
const deletePaymentRequest = async (req, res) => {
    try {
        const pr = await service.getPaymentRequestById(req.params.id);
        if (!pr) {
            return res.status(404).json({ success: false, message: "Payment request not found." });
        }
        if (pr.status !== "INITIATED") {
            return res.status(400).json({
                success: false,
                message: "Only INITIATED requests can be deleted.",
            });
        }
        await service.deletePaymentRequest(req.params.id);
        return res.status(200).json({ success: true, message: "Payment request deleted." });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
};

module.exports = {
    createPaymentRequest,
    getPaymentRequests,
    getPaymentRequestById,
    updateStatus,
    deletePaymentRequest,
};
