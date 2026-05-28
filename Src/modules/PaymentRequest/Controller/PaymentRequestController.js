const { PaymentRequest } = require("../Model/PaymentRequestModel");
const uploadLocal = require("../../../utils/uploadLocal");

const roleModelMap = {
    admin: "Admin",
    countrymanager: "CountryManager",
    financeadmin: "FinanceAdmin",
    branchmanager: "BranchManager",
    operationaladmin: "OperationalAdmin",
};

// ─── Create Payment Request ──────────────────────────────────────────────────
const createPaymentRequest = async (req, res) => {
    try {
        const user = req.user;
        const userRole = (user.role || "").toLowerCase();
        const requestedByRole = roleModelMap[userRole] || "Admin";

        const {
            amount,
            reason,
            expectedPaymentDate,
            currency = "USD",
            additionalNotes,
            category = "OPERATIONAL",
            country,
            branchId,
        } = req.body;

        if (!amount || amount <= 0) {
            return res.status(400).json({ success: false, message: "Please provide a valid amount." });
        }
        if (!reason || !reason.trim()) {
            return res.status(400).json({ success: false, message: "Please provide a reason." });
        }
        if (!expectedPaymentDate) {
            return res.status(400).json({ success: false, message: "Please provide an expected payment date." });
        }

        let supportingDocument;
        if (req.file) {
            const fileUrl = uploadLocal(req.file, "payment-requests");
            supportingDocument = {
                name: req.file.originalname,
                url: fileUrl,
                uploadedAt: new Date(),
            };
        }

        const userId = user.id || user._id;

        const request = await PaymentRequest.create({
            requestedBy: userId,
            requestedByRole,
            country: country || user.country || "US",
            branchId: branchId || undefined,
            amount: Number(amount),
            currency,
            reason,
            expectedPaymentDate: new Date(expectedPaymentDate),
            additionalNotes,
            category,
            supportingDocument,
            statusHistory: [
                {
                    status: "INITIATED",
                    changedBy: userId,
                    changedByRole: requestedByRole,
                    timestamp: new Date(),
                    notes: "Payment request submitted.",
                }
            ]
        });

        return res.status(201).json({
            success: true,
            message: "Payment request submitted successfully.",
            data: request,
        });
    } catch (error) {
        console.error("[PaymentRequest] Create error:", error);
        return res.status(500).json({ success: false, message: error.message || "Internal server error" });
    }
};

// ─── Get Payment Requests ────────────────────────────────────────────────────
const getPaymentRequests = async (req, res) => {
    try {
        const user = req.user;
        const userRole = (user.role || "").toLowerCase();
        const userId = user.id || user._id;

        const { status, country, page = 1, limit = 50 } = req.query;
        const query = {};

        // Filtering based on role
        const isGlobalFinance = ["admin", "financeadmin"].includes(userRole);
        if (!isGlobalFinance) {
            query.requestedBy = userId;
        }

        if (status) query.status = status;
        if (country) query.country = country;

        const total = await PaymentRequest.countDocuments(query);
        const requests = await PaymentRequest.find(query)
            .sort({ createdAt: -1 })
            .skip((Number(page) - 1) * Number(limit))
            .limit(Number(limit))
            .populate("requestedBy", "fullName email")
            .populate("branchId", "name city");

        return res.status(200).json({
            success: true,
            data: requests,
            pagination: {
                total,
                page: Number(page),
                limit: Number(limit),
                pages: Math.ceil(total / Number(limit)),
            }
        });
    } catch (error) {
        console.error("[PaymentRequest] Get error:", error);
        return res.status(500).json({ success: false, message: error.message || "Internal server error" });
    }
};

// ─── Get Single Payment Request by ID ────────────────────────────────────────
const getPaymentRequestById = async (req, res) => {
    try {
        const user = req.user;
        const userRole = (user.role || "").toLowerCase();
        const userId = user.id || user._id;

        const request = await PaymentRequest.findById(req.params.id)
            .populate("requestedBy", "fullName email")
            .populate("reviewedBy", "fullName email")
            .populate("branchId", "name city");

        if (!request) {
            return res.status(404).json({ success: false, message: "Payment request not found." });
        }

        // Access check
        const isGlobalFinance = ["admin", "financeadmin"].includes(userRole);
        if (!isGlobalFinance && String(request.requestedBy._id) !== String(userId)) {
            return res.status(403).json({ success: false, message: "Unauthorized access to this payment request." });
        }

        return res.status(200).json({ success: true, data: request });
    } catch (error) {
        console.error("[PaymentRequest] GetById error:", error);
        return res.status(500).json({ success: false, message: error.message || "Internal server error" });
    }
};

// ─── Update Payment Request Status ───────────────────────────────────────────
const updatePaymentRequestStatus = async (req, res) => {
    try {
        const user = req.user;
        const userRole = (user.role || "").toLowerCase();
        const userId = user.id || user._id;
        const reviewerRole = roleModelMap[userRole] || "FinanceAdmin";

        const { status, reviewNotes } = req.body;

        if (!status) {
            return res.status(400).json({ success: false, message: "Please provide a target status." });
        }

        const request = await PaymentRequest.findById(req.params.id);
        if (!request) {
            return res.status(404).json({ success: false, message: "Payment request not found." });
        }

        // Allowed transitions validation
        const allowedTransitions = {
            INITIATED: ["UNDER_REVIEW", "APPROVED", "REJECTED"],
            UNDER_REVIEW: ["APPROVED", "REJECTED"],
            APPROVED: ["PAID"],
            REJECTED: [],
            PAID: [],
        };

        const currentAllowed = allowedTransitions[request.status] || [];
        if (!currentAllowed.includes(status)) {
            return res.status(400).json({
                success: false,
                message: `Status transition from ${request.status} to ${status} is not allowed.`,
            });
        }

        // Update fields
        request.status = status;
        request.reviewedBy = userId;
        request.reviewedByRole = reviewerRole;
        request.reviewedAt = new Date();
        if (reviewNotes) {
            request.reviewNotes = reviewNotes;
        }

        // Add history entry
        request.statusHistory.push({
            status,
            changedBy: userId,
            changedByRole: reviewerRole,
            timestamp: new Date(),
            notes: reviewNotes || `Status updated to ${status}.`,
        });

        await request.save();

        // Populate and return
        const populated = await PaymentRequest.findById(request._id)
            .populate("requestedBy", "fullName email")
            .populate("reviewedBy", "fullName email")
            .populate("branchId", "name city");

        return res.status(200).json({
            success: true,
            message: `Payment request status updated to ${status} successfully.`,
            data: populated,
        });
    } catch (error) {
        console.error("[PaymentRequest] Update status error:", error);
        return res.status(500).json({ success: false, message: error.message || "Internal server error" });
    }
};

// ─── Delete Payment Request ──────────────────────────────────────────────────
const deletePaymentRequest = async (req, res) => {
    try {
        const userId = req.user.id || req.user._id;

        const request = await PaymentRequest.findById(req.params.id);
        if (!request) {
            return res.status(404).json({ success: false, message: "Payment request not found." });
        }

        if (String(request.requestedBy) !== String(userId)) {
            return res.status(403).json({ success: false, message: "Only the creator can delete this request." });
        }

        if (request.status !== "INITIATED") {
            return res.status(400).json({ success: false, message: "Only INITIATED payment requests can be deleted." });
        }

        await PaymentRequest.findByIdAndDelete(req.params.id);

        return res.status(200).json({
            success: true,
            message: "Payment request deleted successfully.",
        });
    } catch (error) {
        console.error("[PaymentRequest] Delete error:", error);
        return res.status(500).json({ success: false, message: error.message || "Internal server error" });
    }
};

module.exports = {
    createPaymentRequest,
    getPaymentRequests,
    getPaymentRequestById,
    updatePaymentRequestStatus,
    deletePaymentRequest,
};
