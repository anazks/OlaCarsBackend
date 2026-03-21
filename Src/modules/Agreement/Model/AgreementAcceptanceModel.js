const mongoose = require("mongoose");

const agreementAcceptanceSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true
        },
        agreementId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Agreement",
            required: true,
            index: true
        },
        versionId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "AgreementVersion",
            required: true
        },
        acceptedAt: {
            type: Date,
            default: Date.now,
            required: true
        },
        ipAddress: {
            type: String
        },
        userAgent: {
            type: String
        },
        signatureType: {
            type: String,
            enum: ["CLICK_WRAP", "TYPED", "DRAWN"],
            required: true
        },
        signatureData: {
            type: String, // Typed name or S3 URL for drawn signature
        },
        digitalFingerprint: {
            type: String,
            description: "Hash of the agreement content at the time of signing"
        }
    },
    {
        timestamps: true
    }
);

// Compound index to quickly check if a user has accepted a specific version
agreementAcceptanceSchema.index({ userId: 1, agreementId: 1, versionId: 1 }, { unique: true });

module.exports = mongoose.model("AgreementAcceptance", agreementAcceptanceSchema);
