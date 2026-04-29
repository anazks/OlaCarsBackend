const mongoose = require("mongoose");

const operationalAdminSchema = new mongoose.Schema(
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
            default: "OPERATIONADMIN",
            enum: ["OPERATIONADMIN"]
        },
        permissions: {
            type: [String],
            default: []
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
    loginHistory: [
      {
        loginTime: { type: Date, required: true },
        logoutTime: { type: Date },
        ipAddress: { type: String }
      }
    ],
    lastLoginAt: {
      type: Date,
    },
    passwordChangedAt: {
      type: Date,
    },
    failedLoginAttempts: {
      type: Number,
      default: 0,
    },
    lockUntil: {
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
  {
    timestamps: true,
    toJSON: {
      transform(doc, ret) {
        delete ret.passwordHash;
        delete ret.refreshToken;
        delete ret.failedLoginAttempts;
        delete ret.lockUntil;
        delete ret.__v;
        return ret;
      }
    },
    toObject: {
      transform(doc, ret) {
        delete ret.passwordHash;
        delete ret.refreshToken;
        delete ret.failedLoginAttempts;
        delete ret.lockUntil;
        delete ret.__v;
        return ret;
      }
    }
  }
);

const OperationalAdmin = mongoose.models.OperationalAdmin || mongoose.model("OperationalAdmin", operationalAdminSchema);
if (!mongoose.models.OPERATIONADMIN) {
  mongoose.model("OPERATIONADMIN", operationalAdminSchema, "operationaladmins");
}
module.exports = OperationalAdmin;
