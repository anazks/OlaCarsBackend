const mongoose = require("mongoose");
const { ROLES } = require("../../../shared/constants/roles");

const paymentTransactionSchema = new mongoose.Schema(
    {
        accountingCode: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "AccountingCode",
            required: true,
        },
        referenceId: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
        },
        referenceModel: {
            type: String,
            required: true,
            enum: ["PurchaseOrder", "Driver"], // Extensible for "Booking", "Repair", etc.
        },
        transactionCategory: {
            type: String,
            required: true,
            enum: ["INCOME", "EXPENSE", "LIABILITY", "ASSET", "EQUITY"],
        },
        transactionType: {
            type: String,
            required: true,
            enum: ["CREDIT", "DEBIT"], // CREDIT = receiving money, DEBIT = spending money
        },
        isTaxInclusive: {
            type: Boolean,
            default: false,
        },
        baseAmount: {
            type: Number,
            required: true,
        },
        taxApplied: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Tax",
        },
        taxAmount: {
            type: Number,
            default: 0,
        },
        totalAmount: {
            type: Number,
            required: true,
        },
        paymentMethod: {
            type: String,
            required: true,
            enum: ["CASH", "BANK_TRANSFER", "CREDIT_CARD", "CHEQUE", "OTHER"],
        },
        status: {
            type: String,
            required: true,
            enum: ["PENDING", "COMPLETED", "FAILED", "CANCELLED"],
            default: "PENDING",
        },
        paymentDate: {
            type: Date,
            default: Date.now,
        },
        notes: {
            type: String,
            trim: true, // E.g., EMI 1 of 12
        },
        codTrx: {
            type: String,
            unique: true,
            sparse: true,
        },
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            refPath: "creatorRole",
        },
        creatorRole: {
            type: String,
            required: true,
            enum: Object.values(ROLES),
        },
    },
    { timestamps: true }
);

module.exports = mongoose.model("PaymentTransaction", paymentTransactionSchema);
