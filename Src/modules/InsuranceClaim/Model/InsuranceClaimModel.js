const mongoose = require("mongoose");

const CLAIM_STATUSES = [
    "DRAFT",
    "SUBMITTED",
    "UNDER_REVIEW",
    "APPROVED",
    "REJECTED",
    "PAYMENT_RECEIVED",
    "CLOSED",
];

const insuranceClaimSchema = new mongoose.Schema(
    {
        claimNumber: { type: String, unique: true, required: true },

        // References
        workOrderId: { type: mongoose.Schema.Types.ObjectId, ref: "WorkOrder", required: true },
        vehicleId: { type: mongoose.Schema.Types.ObjectId, ref: "Vehicle", required: true },
        branchId: { type: mongoose.Schema.Types.ObjectId, ref: "Branch", required: true },

        // Incident
        incidentDate: { type: Date, required: true },
        incidentDescription: { type: String, required: true },
        incidentLocation: { type: String },
        policeReportNumber: { type: String },
        policeReportDocument: { type: String }, // S3 key

        // Insurance details (auto-populated from vehicle)
        insurerName: { type: String, required: true },
        policyNumber: { type: String, required: true },
        insuranceType: { type: String },
        excessAmount: { type: Number, default: 0 },

        // Claim amounts
        claimAmount: { type: Number, required: true },
        approvedAmount: { type: Number },
        excessDeducted: { type: Number, default: 0 },
        netPayable: { type: Number },

        // Status
        status: { type: String, enum: CLAIM_STATUSES, default: "DRAFT" },

        // Documents
        documents: [
            {
                name: { type: String },
                url: { type: String }, // S3 key
                uploadedAt: { type: Date, default: Date.now },
            },
        ],

        // Payment
        paymentReference: { type: String },
        paymentDate: { type: Date },
        paymentAmount: { type: Number },

        // Rejection
        rejectionReason: { type: String },

        // Timeline
        submittedAt: { type: Date },
        reviewStartedAt: { type: Date },
        resolvedAt: { type: Date },

        // Notes
        notes: { type: String },
        insurerNotes: { type: String },

        // Status history
        statusHistory: [
            {
                status: { type: String, enum: CLAIM_STATUSES },
                changedBy: { type: mongoose.Schema.Types.ObjectId, refPath: "statusHistory.changedByRole" },
                changedByRole: { type: String },
                timestamp: { type: Date, default: Date.now },
                notes: { type: String },
            },
        ],

        // Audit
        createdBy: { type: mongoose.Schema.Types.ObjectId, required: true, refPath: "creatorRole" },
        creatorRole: { type: String, required: true },
    },
    { timestamps: true }
);

// Indexes
insuranceClaimSchema.index({ claimNumber: 1 });
insuranceClaimSchema.index({ workOrderId: 1 });
insuranceClaimSchema.index({ vehicleId: 1 });
insuranceClaimSchema.index({ status: 1 });
insuranceClaimSchema.index({ branchId: 1 });

module.exports = {
    InsuranceClaim: mongoose.model("InsuranceClaim", insuranceClaimSchema),
    CLAIM_STATUSES,
};
