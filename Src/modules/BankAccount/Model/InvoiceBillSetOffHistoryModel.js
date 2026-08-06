const mongoose = require("mongoose");
const { ROLES } = require("../../../shared/constants/roles");

/**
 * Invoice & Bill Set-off History Model
 *
 * Records the before/after state of each Invoice or Supplier Bill affected by a bank transaction's
 * automatic set-off. One record per primary bank transaction ledger entry.
 *
 * Supports both Customer Invoices (targetType: "CUSTOMER") and Supplier Bills (targetType: "SUPPLIER").
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

const billSnapshotSchema = new mongoose.Schema({
    bill: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Bill",
        required: true,
    },
    billNumber: {
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

const invoiceBillSetOffHistorySchema = new mongoose.Schema(
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
        targetType: {
            type: String,
            enum: ["CUSTOMER", "SUPPLIER"],
            default: "CUSTOMER",
        },
        customer: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Customer",
            required: false,
        },
        supplier: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Supplier",
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
        billSnapshots: [billSnapshotSchema],
        excessAmount: {
            type: Number,
            default: 0,
        },
        paymentReceived: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "PaymentReceived",
            required: false,
        },
        vendorPayment: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "PaymentMade",
            required: false,
        },
        partnerLedgerEntries: [{
            type: mongoose.Schema.Types.ObjectId,
            ref: "LedgerEntry",
        }],
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

invoiceBillSetOffHistorySchema.index({ customer: 1 });
invoiceBillSetOffHistorySchema.index({ supplier: 1 });
invoiceBillSetOffHistorySchema.index({ bankAccount: 1 });

const InvoiceBillSetOffHistory = mongoose.models.InvoiceBillSetOffHistory || mongoose.model("InvoiceBillSetOffHistory", invoiceBillSetOffHistorySchema);

// Export primary model and alias export for backward compatibility
module.exports = InvoiceBillSetOffHistory;
module.exports.InvoiceBillSetOffHistory = InvoiceBillSetOffHistory;
module.exports.InvoiceSetOffHistory = InvoiceBillSetOffHistory;
