const mongoose = require("mongoose");

const agreementVersionSchema = new mongoose.Schema(
  {
    agreementId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Agreement",
      required: true,
    },
    title: {
      type: String,
      required: true,
    },
    type: {
      type: String,
      required: true,
    },
    content: {
      type: String,
      required: true,
    },
    version: {
      type: Number,
      required: true,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: "updaterRole",
      required: true,
    },
    updaterRole: {
      type: String,
      required: true,
      enum: ["ADMIN", "OPERATIONADMIN", "COUNTRYMANAGER"],
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("AgreementVersion", agreementVersionSchema);
