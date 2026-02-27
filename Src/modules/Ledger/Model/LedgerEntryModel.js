const mongoose = require("mongoose");

const ledgerEntrySchema = new mongoose.Schema(
    {
        transaction: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "PaymentTransaction",
            required: true,
        },
        accountingCode: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "AccountingCode",
            required: true,
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
    },
    { timestamps: true }
);

// Search indexes to query ledgers effectively
ledgerEntrySchema.index({ transaction: 1 });
ledgerEntrySchema.index({ accountingCode: 1 });
ledgerEntrySchema.index({ type: 1 });

module.exports = mongoose.model("LedgerEntry", ledgerEntrySchema);
