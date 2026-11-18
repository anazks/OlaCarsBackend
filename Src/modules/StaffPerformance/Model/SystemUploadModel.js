const mongoose = require("mongoose");
const { ROLES } = require("../../../shared/constants/roles");

const systemUploadSchema = new mongoose.Schema(
    {
        originalName: {
            type: String,
            required: true,
            trim: true,
        },
        fileUrl: {
            type: String,
            required: true,
            trim: true,
        },
        storageType: {
            type: String,
            enum: ["LOCAL", "S3", "EXTERNAL"],
            default: "LOCAL",
        },
        mimeType: {
            type: String,
            trim: true,
        },
        fileSize: {
            type: Number, // In bytes
            default: 0,
        },
        module: {
            type: String,
            enum: [
                "INVOICE",
                "BILL",
                "SERVICE_BILL",
                "DEBIT_NOTE",
                "CREDIT_NOTE",
                "BANK_STATEMENT",
                "BANK_PAYMENT_PROOF",
                "DRIVER_KYC",
                "VEHICLE_DOC",
                "PURCHASE_ORDER",
                "WORKSHOP",
                "EXPENSE",
                "GENERAL",
            ],
            default: "GENERAL",
            required: true,
        },
        entityId: {
            type: mongoose.Schema.Types.ObjectId,
            required: false,
        },
        entityModel: {
            type: String,
            required: false,
        },
        entityReference: {
            type: String, // e.g. "INV-2026-0012", "BILL-104", "STATEMENT_OCT"
            trim: true,
        },
        uploadedBy: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            refPath: "uploaderRole",
        },
        uploaderRole: {
            type: String,
            required: true,
        },
        uploaderName: {
            type: String,
            trim: true,
        },
        branchId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Branch",
            required: false,
        },
        status: {
            type: String,
            enum: ["SUCCESS", "FAILED", "PROCESSING"],
            default: "SUCCESS",
        },
        notes: {
            type: String,
            trim: true,
        },
        metadata: {
            type: mongoose.Schema.Types.Mixed,
        },
    },
    { timestamps: true }
);

systemUploadSchema.index({ uploadedBy: 1, createdAt: -1 });
systemUploadSchema.index({ module: 1, createdAt: -1 });
systemUploadSchema.index({ branchId: 1, createdAt: -1 });
systemUploadSchema.index({ createdAt: -1 });

module.exports = mongoose.models.SystemUpload || mongoose.model("SystemUpload", systemUploadSchema);

