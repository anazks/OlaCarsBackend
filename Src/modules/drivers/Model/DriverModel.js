// models/Driver.js
const mongoose = require("mongoose");

const driverSchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      required: true,
      trim: true,
    },

    phone: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },

    email: {
      type: String,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, "Invalid email format"],
    },

    cedulaNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },

    driverLicenseNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },

    licenseExpiryDate: {
      type: Date,
      required: true,
    },

    dateOfBirth: {
      type: Date,
      required: true,
    },

    address: {
      type: String,
      trim: true,
    },

    experienceYears: {
      type: Number,
      default: 0,
      min: 0,
    },

    creditScore: {
      type: Number,
      min: 0,
      max: 1000,
    },

    contractSigned: {
      type: Boolean,
      default: false,
    },

    status: {
      type: String,
      enum: ["pending", "review", "active", "rejected", "suspended"],
      default: "pending",
    },

    // 👇 Who updated status last
    statusUpdatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    statusUpdatedAt: {
      type: Date,
    },

    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Branch",
      required: true,
      index: true,
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    // 👇 Soft delete field
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },

    deletedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Driver", driverSchema);