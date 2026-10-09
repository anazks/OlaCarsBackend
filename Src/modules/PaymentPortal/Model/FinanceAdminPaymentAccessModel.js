const mongoose = require("mongoose");

const financeAdminPaymentAccessSchema = new mongoose.Schema(
  {
    financeAdminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "FinanceAdmin",
      required: true,
      unique: true,
      index: true,
    },
    fullName: {
      type: String,
      trim: true,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      index: true,
    },
    mpin: {
      type: String,
      default: null,
    },
    mpinHash: {
      type: String,
      required: true,
    },
    hasEntryAccess: {
      type: Boolean,
      default: true,
    },
    hasApprovalAccess: {
      type: Boolean,
      default: false,
    },
    status: {
      type: String,
      enum: ["ACTIVE", "LOCKED", "SUSPENDED"],
      default: "ACTIVE",
    },
    failedAttempts: {
      type: Number,
      default: 0,
    },
    lockUntil: {
      type: Date,
      default: null,
    },
    lastMpinLoginAt: {
      type: Date,
      default: null,
    },
    setBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
    },
    setAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

financeAdminPaymentAccessSchema.methods.isLocked = function () {
  return !!(this.lockUntil && this.lockUntil > new Date());
};

const FinanceAdminPaymentAccess = mongoose.model(
  "FinanceAdminPaymentAccess",
  financeAdminPaymentAccessSchema
);

module.exports = FinanceAdminPaymentAccess;
