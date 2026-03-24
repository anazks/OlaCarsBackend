const mongoose = require("mongoose");

const agreementSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    country: {
      type: String,
      required: true,
      trim: true,
    },
    type: {
      type: String,
      required: true,
      enum: ["TERMS_AND_CONDITIONS", "PRIVACY_POLICY", "RETURN_POLICY", "OTHER", "DRIVER_AGREEMENT", "LEGAL_AGREEMENT", "VEHICLE_ASSIGNMENT_AGREEMENT"],
      default: "OTHER",
    },
    content: {
      type: String,
      required: true,
    },
    version: {
      type: Number,
      default: 1,
    },
    status: {
      type: String,
      enum: ["DRAFT", "PUBLISHED", "ARCHIVED"],
      default: "PUBLISHED",
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: "creatorRole",
      required: true,
    },
    creatorRole: {
      type: String,
      required: true,
      enum: ["ADMIN", "OPERATIONADMIN", "COUNTRYMANAGER"],
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: "updaterRole",
    },
    updaterRole: {
      type: String,
      enum: ["ADMIN", "OPERATIONADMIN", "COUNTRYMANAGER"],
    },
  },
  {
    timestamps: true,
  }
);

agreementSchema.index({ title: 1, country: 1 }, { unique: true });

module.exports = mongoose.model("Agreement", agreementSchema);
