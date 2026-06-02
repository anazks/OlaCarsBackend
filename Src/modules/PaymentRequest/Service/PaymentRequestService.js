const repo = require("../Repo/PaymentRequestRepo");

/**
 * Generates a unique sequential request number like PR-20260526-0001
 */
const generateRequestNumber = async () => {
    const { PaymentRequest } = require("../Model/PaymentRequestModel");
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const count = await PaymentRequest.countDocuments({ createdAt: { $gte: todayStart } });
    return `PR-${dateStr}-${String(count + 1).padStart(4, "0")}`;
};

/**
 * Country Manager creates a payment request
 */
const createPaymentRequest = async ({
    requestedBy,
    requestedByRole,
    country,
    branchId,
    amount,
    currency,
    reason,
    expectedPaymentDate,
    additionalNotes,
    category,
    supportingDocument,
}) => {
    const requestNumber = await generateRequestNumber();

    const pr = await repo.createPaymentRequest({
        requestNumber,
        requestedBy,
        requestedByRole: requestedByRole || "CountryManager",
        country,
        branchId,
        amount,
        currency: currency || "USD",
        reason,
        expectedPaymentDate,
        additionalNotes,
        category: category || "OPERATIONAL",
        supportingDocument,
        status: "INITIATED",
        statusHistory: [
            {
                status: "INITIATED",
                changedBy: requestedBy,
                changedByRole: requestedByRole || "CountryManager",
                timestamp: new Date(),
                notes: "Request submitted",
            },
        ],
    });

    return pr;
};

/**
 * List payment requests (filterable)
 */
const getPaymentRequests = async (filters) => {
    return repo.getPaymentRequests(filters);
};

/**
 * Get single payment request
 */
const getPaymentRequestById = async (id) => {
    return repo.getPaymentRequestById(id);
};

/**
 * Financial Admin updates status
 */
const updateStatus = async (id, status, reviewedBy, reviewedByRole, reviewNotes) => {
    return repo.updatePaymentRequestStatus(id, status, reviewedBy, reviewedByRole, reviewNotes);
};

/**
 * Delete (only INITIATED by the same requester)
 */
const deletePaymentRequest = async (id) => {
    return repo.deletePaymentRequest(id);
};

module.exports = {
    createPaymentRequest,
    getPaymentRequests,
    getPaymentRequestById,
    updateStatus,
    deletePaymentRequest,
};
