const mongoose = require("mongoose");

const PAYMENT_PORTAL_ENTRY_STATUSES = [
  "DRAFT",
  "PENDING_APPROVAL",
  "APPROVED",
  "REJECTED",
];

const supportingDocumentSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    url: { type: String, required: true },
    mimeType: { type: String },
    size: { type: Number },
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const statusHistoryEntrySchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: PAYMENT_PORTAL_ENTRY_STATUSES,
      required: true,
    },
    actionBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "FinanceAdmin",
      required: true,
    },
    actionByName: { type: String, required: true },
    actionRole: { type: String, default: "FINANCEADMIN" },
    timestamp: { type: Date, default: Date.now },
    remarks: { type: String, trim: true },
  },
  { _id: true }
);

const paymentPortalEntrySchema = new mongoose.Schema(
  {
    entryNumber: {
      type: String,
      unique: true,
      required: true,
      index: true,
    },
    vendor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Supplier",
      required: true,
      index: true,
    },
    vendorName: {
      type: String,
      trim: true,
    },
    amount: {
      type: Number,
      required: true,
      min: [0.01, "Amount must be greater than zero"],
    },
    currency: {
      type: String,
      default: "USD",
      trim: true,
    },
    debitAccount: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AccountingCode",
      required: true,
    },
    creditAccount: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AccountingCode",
      required: true,
    },
    paymentDate: {
      type: Date,
      required: true,
      default: Date.now,
    },
    referenceNumber: {
      type: String,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    supportingDocuments: [supportingDocumentSchema],
    status: {
      type: String,
      enum: PAYMENT_PORTAL_ENTRY_STATUSES,
      default: "PENDING_APPROVAL",
      index: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "FinanceAdmin",
      required: true,
      index: true,
    },
    creatorName: {
      type: String,
      trim: true,
    },
    creatorEmail: {
      type: String,
      trim: true,
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "FinanceAdmin",
    },
    reviewerName: {
      type: String,
      trim: true,
    },
    reviewedAt: {
      type: Date,
    },
    rejectionRemark: {
      type: String,
      trim: true,
    },
    approvalNotes: {
      type: String,
      trim: true,
    },
    revisionCount: {
      type: Number,
      default: 0,
    },
    statusHistory: [statusHistoryEntrySchema],
  },
  {
    timestamps: true,
  }
);

paymentPortalEntrySchema.index({ createdAt: -1 });
paymentPortalEntrySchema.index({ status: 1, createdBy: 1 });
paymentPortalEntrySchema.index({ paymentDate: -1 });

const PaymentPortalEntry = mongoose.model(
  "PaymentPortalEntry",
  paymentPortalEntrySchema
);

module.exports = {
  PaymentPortalEntry,
  PAYMENT_PORTAL_ENTRY_STATUSES,
};
