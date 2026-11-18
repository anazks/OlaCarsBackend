const mongoose = require("mongoose");
const { ROLES } = require("../../../shared/constants/roles");

const staffActivityLogSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            refPath: "userRole",
        },
        userRole: {
            type: String,
            required: true,
        },
        userName: {
            type: String,
            required: true,
            trim: true,
        },
        userEmail: {
            type: String,
            trim: true,
        },
        branchId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Branch",
            required: false,
        },
        action: {
            type: String,
            enum: [
                "CREATE",
                "UPDATE",
                "DELETE",
                "UPLOAD",
                "SET_OFF",
                "STATUS_CHANGE",
                "BULK_IMPORT",
                "PAYMENT_RECORDED",
                "VOID",
            ],
            required: true,
        },
        entityType: {
            type: String,
            enum: [
                "INVOICE",
                "BILL",
                "SERVICE_BILL",
                "DEBIT_NOTE",
                "CREDIT_NOTE",
                "BANK_TRANSACTION",
                "BANK_STATEMENT",
                "UPLOAD",
                "PAYMENT",
                "EXPENSE",
                "OTHER",
            ],
            required: true,
        },
        entityId: {
            type: mongoose.Schema.Types.ObjectId,
            required: false,
        },
        entityIdentifier: {
            type: String, // e.g. "INV-1092", "BILL-551", "TXN-9841"
            trim: true,
        },
        amount: {
            type: Number,
            default: 0,
        },
        description: {
            type: String,
            trim: true,
        },
        fileUrl: {
            type: String,
            trim: true,
        },
        fileName: {
            type: String,
            trim: true,
        },
        metadata: {
            type: mongoose.Schema.Types.Mixed,
        },
        timestamp: {
            type: Date,
            default: Date.now,
        },
    },
    { timestamps: true }
);

staffActivityLogSchema.index({ userId: 1, createdAt: -1 });
staffActivityLogSchema.index({ entityType: 1, createdAt: -1 });
staffActivityLogSchema.index({ branchId: 1, createdAt: -1 });
staffActivityLogSchema.index({ action: 1, createdAt: -1 });
staffActivityLogSchema.index({ createdAt: -1 });

module.exports = mongoose.models.StaffActivityLog || mongoose.model("StaffActivityLog", staffActivityLogSchema);

