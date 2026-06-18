const mongoose = require("mongoose");
const { ROLES } = require("../../../shared/constants/roles");

const bankTransactionSchema = new mongoose.Schema(
    {
        bankAccount: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "BankAccount",
            required: true,
        },
        branch: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Branch",
            required: false,
        },
        accountingCode: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "AccountingCode",
            required: false,
        },
        type: {
            type: String,
            required: true,
            enum: ["CREDIT", "DEBIT"],
        },
        amount: {
            type: Number,
            required: true,
        },
        description: {
            type: String,
            required: true,
            trim: true,
        },
        entryDate: {
            type: Date,
            default: Date.now,
        },
        transactionType: {
            type: String,
            required: false,
        },
        transactionId: {
            type: String,
            required: false,
            trim: true,
        },
        runningBalance: {
            type: Number,
            required: false,
        },
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            refPath: "creatorRole",
        },
        creatorRole: {
            type: String,
            required: true,
            enum: Object.values(ROLES || {}),
        },
    },
    { timestamps: true }
);

bankTransactionSchema.index({ bankAccount: 1 });
bankTransactionSchema.index({ branch: 1 });
bankTransactionSchema.index({ type: 1 });
bankTransactionSchema.index({ entryDate: 1 });
bankTransactionSchema.index({ transactionId: 1 });

module.exports = mongoose.models.BankTransaction || mongoose.model("BankTransaction", bankTransactionSchema);
