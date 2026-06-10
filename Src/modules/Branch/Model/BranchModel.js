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

    // Differentiates between a branch and a workshop
    type: {
      type: String,
      enum: ["BRANCH", "WORKSHOP"],
      default: "BRANCH",
    },



    address: {
      type: String,
      trim: true,
    },

    city: {
      type: String,
      trim: true,
    },

    state: {
      type: String,
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

    country: {
      type: String,
      trim: true,
    },
    countryManager: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CountryManager",
    },
    branchManager: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BranchManager",
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: "creatorRole",
      required: true,
    },
    creatorRole: {
      type: String,
      required: true,
      enum: ["ADMIN", "OPERATIONADMIN", "FINANCEADMIN", "COUNTRYMANAGER", "BRANCHMANAGER"],
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
    toJSON: {
      virtuals: true,
      transform(doc, ret) {
        delete ret.__v;
        return ret;
      },
    },
    toObject: {
      virtuals: true,
      transform(doc, ret) {
        delete ret.__v;
        return ret;
      },
    },
  }
);



module.exports = mongoose.model("Branch", branchSchema);

