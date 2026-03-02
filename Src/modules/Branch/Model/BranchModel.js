const mongoose = require("mongoose");


const branchSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
    },

    address: {
      type: String,
      required: true,
      trim: true,
    },

    city: {
      type: String,
      required: true,
      trim: true,
    },

    state: {
      type: String,
      required: true,
      trim: true,
    },

    phone: {
      type: String,
      required: true,
      trim: true,
    },

    email: {
      type: String,
      trim: true,
      lowercase: true,
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: "creatorRole",
      required: true,
    },
    creatorRole: {
      type: String,
      required: true,
      enum: ["ADMIN", "OPERATIONADMIN", "FINANCEADMIN", "COUNTRYMANAGER"],
    },

    status: {
      type: String,
      enum: ["ACTIVE", "INACTIVE"],
      default: "ACTIVE",
    },

    isDeleted: {
      type: Boolean,
      default: false, // Soft delete
    },
  },
  {
    timestamps: true, // createdAt & updatedAt
  }
);

branchSchema.post(['find', 'findOne'], async function (docs) {
  if (!docs) return;

  // Map of role enum to actual mongoose model names
  const roleToModelMapping = {
    'ADMIN': 'Admin',
    'OPERATIONADMIN': 'OperationalAdmin',
    'FINANCEADMIN': 'FinanceAdmin',
    'COUNTRYMANAGER': 'CountryManager'
  };

  const processDoc = (doc) => {
    if (doc && doc.creatorRole && roleToModelMapping[doc.creatorRole]) {
      doc.creatorRole = roleToModelMapping[doc.creatorRole];
    }
  };

  if (Array.isArray(docs)) {
    docs.forEach(processDoc);
  } else {
    processDoc(docs);
  }
});

module.exports = mongoose.model("Branch", branchSchema);
