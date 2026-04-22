const mongoose = require("mongoose");

const roleTemplateSchema = new mongoose.Schema(
  {
    roleName: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      // For now, mapping directly to existing roles
      enum: [
        "ADMIN",
        "OPERATIONADMIN",
        "FINANCEADMIN",
        "COUNTRYMANAGER",
        "BRANCHMANAGER",
        "OPERATIONSTAFF",
        "FINANCESTAFF",
        "WORKSHOPMANAGER",
        "WORKSHOPSTAFF",
      ],
    },
    permissions: [
      {
        type: String, // These should correspond to values in permissions.js
      },
    ],
    description: {
      type: String,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: "creatorRole",
    },
    creatorRole: {
      type: String,
      enum: ["ADMIN"], // Only Super Admins should manage standard role templates
    },
  },
  {
    timestamps: true,
  }
);

const RoleTemplate = mongoose.model("RoleTemplate", roleTemplateSchema);
module.exports = RoleTemplate;
