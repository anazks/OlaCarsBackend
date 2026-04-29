const mongoose = require("mongoose");
const { ROLES } = require("../../../shared/constants/roles");

const ledgerEntrySchema = new mongoose.Schema(
    {
        transaction: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "PaymentTransaction",
            required: false, // Made optional for manual entries
        },
        manualJournal: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "ManualJournal",
            required: false,
        },
        branch: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Branch",
            required: false,
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
        // Tax Information
        taxInfo: {
            taxApplied: { type: mongoose.Schema.Types.ObjectId, ref: "Tax" },
            taxAmount: { type: Number, default: 0 },
            isTaxInclusive: { type: Boolean, default: false },
        },
        // Audit Trail
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

// Search indexes to query ledgers effectively
ledgerEntrySchema.index({ transaction: 1 });
ledgerEntrySchema.index({ manualJournal: 1 });
ledgerEntrySchema.index({ branch: 1 });
ledgerEntrySchema.index({ accountingCode: 1 });
ledgerEntrySchema.index({ type: 1 });
ledgerEntrySchema.index({ entryDate: 1 });

module.exports = mongoose.model("LedgerEntry", ledgerEntrySchema);
