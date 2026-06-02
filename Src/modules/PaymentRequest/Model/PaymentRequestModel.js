const mongoose = require("mongoose");

const PAYMENT_REQUEST_STATUSES = [
    "INITIATED",
    "UNDER_REVIEW",
    "APPROVED",
    "REJECTED",
    "PAID",
];

const paymentRequestSchema = new mongoose.Schema(
    {
        // Auto-generated reference number
        requestNumber: { type: String, unique: true, required: true },

        // Who made the request
        requestedBy: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            refPath: "requestedByRole",
        },
        requestedByRole: { type: String, required: true, default: "CountryManager" },

        // Country / branch context
        country: { type: String, required: true },
        branchId: { type: mongoose.Schema.Types.ObjectId, ref: "Branch" },

        // Core request details
        amount: { type: Number, required: true, min: 0 },
        currency: { type: String, default: "USD" },
        reason: { type: String, required: true, trim: true },
        expectedPaymentDate: { type: Date, required: true },

        // Additional context
        additionalNotes: { type: String, trim: true },
        category: {
            type: String,
            enum: [
                "OPERATIONAL",
                "MAINTENANCE",
                "STAFF",
                "MARKETING",
                "PROCUREMENT",
                "OTHER",
            ],
            default: "OPERATIONAL",
        },

        // Optional supporting document (file path/URL from upload)
        supportingDocument: {
            name: { type: String },
            url: { type: String },
            uploadedAt: { type: Date },
        },

        // Status tracking
        status: {
            type: String,
            enum: PAYMENT_REQUEST_STATUSES,
            default: "INITIATED",
        },

        // Review info
        reviewedBy: { type: mongoose.Schema.Types.ObjectId, refPath: "reviewedByRole" },
        reviewedByRole: { type: String },
        reviewedAt: { type: Date },
        reviewNotes: { type: String },

        // Payment info (set when approved/paid)
        paidAt: { type: Date },
        paymentReference: { type: String },

        // Status history log
        statusHistory: [
            {
                status: { type: String, enum: PAYMENT_REQUEST_STATUSES },
                changedBy: {
                    type: mongoose.Schema.Types.ObjectId,
                    refPath: "statusHistory.changedByRole",
                },
                changedByRole: { type: String },
                timestamp: { type: Date, default: Date.now },
                notes: { type: String },
            },
        ],
    },
    { timestamps: true }
);

// Indexes for fast queries
paymentRequestSchema.index({ requestedBy: 1 });
paymentRequestSchema.index({ status: 1 });
paymentRequestSchema.index({ country: 1 });
paymentRequestSchema.index({ expectedPaymentDate: 1 });
paymentRequestSchema.index({ createdAt: -1 });

module.exports = {
    PaymentRequest: mongoose.model("PaymentRequest", paymentRequestSchema),
    PAYMENT_REQUEST_STATUSES,
};
