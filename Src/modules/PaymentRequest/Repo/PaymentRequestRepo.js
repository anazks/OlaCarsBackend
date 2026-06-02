const { PaymentRequest } = require("../Model/PaymentRequestModel");

/**
 * Create a new payment request
 */
const createPaymentRequest = async (data) => {
    const pr = new PaymentRequest(data);
    return pr.save();
};

/**
 * Get all payment requests with optional filters
 */
const getPaymentRequests = async (filters = {}) => {
    const {
        status,
        country,
        requestedBy,
        page = 1,
        limit = 20,
        sortBy = "createdAt",
        sortOrder = "desc",
        startDate,
        endDate,
    } = filters;

    const query = {};

    if (status) query.status = status;
    if (country) query.country = country;
    if (requestedBy) query.requestedBy = requestedBy;
    if (startDate || endDate) {
        query.createdAt = {};
        if (startDate) query.createdAt.$gte = new Date(startDate);
        if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    const skip = (Number(page) - 1) * Number(limit);
    const sort = { [sortBy]: sortOrder === "asc" ? 1 : -1 };

    const [data, total] = await Promise.all([
        PaymentRequest.find(query)
            .sort(sort)
            .skip(skip)
            .limit(Number(limit))
            .populate("requestedBy", "fullName email")
            .populate("branchId", "name")
            .populate("reviewedBy", "fullName email")
            .lean(),
        PaymentRequest.countDocuments(query),
    ]);

    return {
        data,
        pagination: {
            total,
            page: Number(page),
            limit: Number(limit),
            totalPages: Math.ceil(total / Number(limit)),
        },
    };
};

/**
 * Get a single payment request by ID
 */
const getPaymentRequestById = async (id) => {
    return PaymentRequest.findById(id)
        .populate("requestedBy", "fullName email")
        .populate("branchId", "name")
        .populate("reviewedBy", "fullName email")
        .lean();
};

/**
 * Update status (used by financial admin to review/approve/reject)
 */
const updatePaymentRequestStatus = async (id, status, reviewedBy, reviewedByRole, reviewNotes) => {
    const update = {
        status,
        reviewedBy,
        reviewedByRole,
        reviewedAt: new Date(),
        reviewNotes,
        $push: {
            statusHistory: {
                status,
                changedBy: reviewedBy,
                changedByRole: reviewedByRole,
                timestamp: new Date(),
                notes: reviewNotes,
            },
        },
    };
    if (status === "PAID") update.paidAt = new Date();
    return PaymentRequest.findByIdAndUpdate(id, update, { new: true });
};

/**
 * Delete a payment request (only if INITIATED)
 */
const deletePaymentRequest = async (id) => {
    return PaymentRequest.findByIdAndDelete(id);
};

module.exports = {
    createPaymentRequest,
    getPaymentRequests,
    getPaymentRequestById,
    updatePaymentRequestStatus,
    deletePaymentRequest,
};
