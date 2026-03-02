const mongoose = require("mongoose");

const financeAdminSchema = new mongoose.Schema(
  {
    refreshToken: {
      type: String,
    },
    fullName: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: {
      type: String,
      required: true,
    },
    role: {
      type: String,
      enum: ["FINANCEADMIN"],
      default: "FINANCEADMIN",
    },
    status: {
      type: String,
      enum: ["ACTIVE", "SUSPENDED", "LOCKED"],
      default: "ACTIVE",
    },
    twoFactorEnabled: {
      type: Boolean,
      default: false,
    },
    lastLoginAt: {
      type: Date,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      refPath: 'creatorRole'
    },
    creatorRole: {
      type: String,
      required: true,
      enum: ['ADMIN']
    }
  },
  { timestamps: true }
);

const FinanceAdmin = mongoose.model("FinanceAdmin", financeAdminSchema);
mongoose.model("FINANCEADMIN", financeAdminSchema, "financeadmins");
module.exports = FinanceAdmin;
