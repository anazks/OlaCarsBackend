const mongoose = require("mongoose");

const financeStaffSchema = new mongoose.Schema(
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
            default: "FINANCESTAFF",
            enum: ["FINANCESTAFF"]
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
        branchId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Branch',
            required: true,
        },
        isDeleted: {
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
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            refPath: 'creatorRole'
        },
        creatorRole: {
            type: String,
            required: true,
            enum: ['BRANCHMANAGER', 'ADMIN', 'FINANCEADMIN', 'COUNTRYMANAGER']
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

const FinanceStaff = mongoose.model("FinanceStaff", financeStaffSchema);
mongoose.model("FINANCESTAFF", financeStaffSchema, "financestaffs");
module.exports = FinanceStaff;
