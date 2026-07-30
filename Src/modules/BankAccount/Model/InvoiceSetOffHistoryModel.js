const mongoose = require("mongoose");
const { ROLES } = require("../../../shared/constants/roles");

/**
 * Invoice Set-off History Model
 *
 * Records the before/after state of each invoice affected by a bank transaction's
 * automatic invoice set-off. One record per BankTransaction.
 *
 * On edit: BEFORE data is preserved, AFTER data is updated.
 * This ensures we always have the original pre-transaction state as the restore point.
 */

const invoiceSnapshotSchema = new mongoose.Schema({
    invoice: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Invoice",
        required: true,
    },
    invoiceNumber: {
        type: String,
        required: true,
    },
    amountApplied: {
        type: Number,
        required: true,
    },
    before: {
        amountPaid: { type: Number, required: true },
        balance: { type: Number, required: true },
        status: { type: String, required: true },
        paidAt: { type: Date, default: null },
    },
    after: {
        amountPaid: { type: Number, required: true },
        balance: { type: Number, required: true },
        status: { type: String, required: true },
        paidAt: { type: Date, default: null },
    },
}, { _id: false });

const invoiceSetOffHistorySchema = new mongoose.Schema(
    {
        primaryLedgerEntry: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "LedgerEntry",
            required: true,
            unique: true, // One history per primary bank ledger entry
        },
        bankAccount: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "BankAccount",
            required: false,
        },
        customer: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Customer",
            required: false,
        },
        transactionAmount: {
            type: Number,
            required: true,
        },
        entryDate: {
            type: Date,
            required: false,
        },
        transactionId: {
            type: String,
            required: false,
            trim: true,
        },
        invoiceSnapshots: [invoiceSnapshotSchema],
        excessAmount: {
            type: Number,
            default: 0,
        },
        paymentReceived: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "PaymentReceived",
            required: false,
        },
        partnerLedgerEntries: [{
            type: mongoose.Schema.Types.ObjectId,
            ref: "LedgerEntry",
        }],
        ledgerJournal: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "ManualJournal",
            required: false,
        },
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            required: false,
            refPath: "creatorRole",
        },
        creatorRole: {
            type: String,
            required: false,
            enum: Object.values(ROLES || {}),
        },
    },
    { timestamps: true }
);

invoiceSetOffHistorySchema.index({ primaryLedgerEntry: 1 }, { unique: true });
invoiceSetOffHistorySchema.index({ customer: 1 });
invoiceSetOffHistorySchema.index({ bankAccount: 1 });

module.exports = mongoose.models.InvoiceSetOffHistory || mongoose.model("InvoiceSetOffHistory", invoiceSetOffHistorySchema);
