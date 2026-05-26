const mongoose = require("mongoose");
const { getNextSequence } = require("../../SystemSettings/Model/CounterModel");

const PAYMENT_REQUEST_STATUSES = ['INITIATED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'PAID'];

const paymentRequestSchema = new mongoose.Schema(
    {
        requestNumber: { type: String, unique: true },
        requestedBy: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            refPath: "requestedByRole",
        },
        requestedByRole: {
            type: String,
            required: true,
            enum: ["Admin", "CountryManager", "FinanceAdmin", "BranchManager", "OperationalAdmin"],
        },
        country: { type: String, required: true },
        branchId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Branch",
        },
        amount: { type: Number, required: true },
        currency: { type: String, default: "USD" },
        reason: { type: String, required: true },
        expectedPaymentDate: { type: Date, required: true },
        additionalNotes: { type: String },
        category: { type: String, default: "OPERATIONAL" },
        supportingDocument: {
            name: { type: String },
            url: { type: String },
            uploadedAt: { type: Date },
        },
        status: {
            type: String,
            enum: PAYMENT_REQUEST_STATUSES,
            default: "INITIATED",
        },
        reviewedBy: {
            type: mongoose.Schema.Types.ObjectId,
            refPath: "reviewedByRole",
        },
        reviewedByRole: {
            type: String,
            enum: ["Admin", "FinanceAdmin"],
        },
        reviewNotes: { type: String },
        reviewedAt: { type: Date },
        statusHistory: [
            {
                status: { type: String, required: true },
                changedBy: { type: mongoose.Schema.Types.ObjectId, required: true },
                changedByRole: { type: String, required: true },
                timestamp: { type: Date, default: Date.now },
                notes: { type: String },
            }
        ]
    },
    { timestamps: true }
);

// Pre-save hook to generate serial requestNumber
paymentRequestSchema.pre("save", async function () {
    if (!this.requestNumber) {
        const seq = await getNextSequence("paymentRequestId");
        this.requestNumber = `PR-${String(seq).padStart(6, "0")}`;
    }
});

module.exports = {
    PaymentRequest: mongoose.model("PaymentRequest", paymentRequestSchema),
    PAYMENT_REQUEST_STATUSES,
};
