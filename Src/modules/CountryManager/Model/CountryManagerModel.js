const mongoose = require("mongoose");

const countryManagerSchema = new mongoose.Schema(
    {
        refreshToken: {
            type: String,
        },
        fullName: {
            type: String,
            required: true,
            trim: true,
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
        phone: {
            type: String,
            trim: true,
        },
        role: {
            type: String,
            enum: ["COUNTRYMANAGER"],
            default: "COUNTRYMANAGER",
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
            enum: ['ADMIN', 'OPERATIONADMIN', 'FINANCEADMIN'] // Depending on what is in JWT or who is generating
        },
        country: {
            type: String,
            required: true,
            trim: true
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

const CountryManager = mongoose.model("CountryManager", countryManagerSchema);
mongoose.model("COUNTRYMANAGER", countryManagerSchema, "countrymanagers");
module.exports = CountryManager;
