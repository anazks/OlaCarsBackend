const mongoose = require("mongoose");

const operationStaffSchema = new mongoose.Schema(
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
            enum: ["OPERATIONSTAFF"],
            default: "OPERATIONSTAFF",
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
            enum: ['BRANCHMANAGER', 'ADMIN', 'OPERATIONADMIN', 'FINANCEADMIN', 'COUNTRYMANAGER']
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

const OperationStaff = mongoose.model("OperationStaff", operationStaffSchema);
mongoose.model("OPERATIONSTAFF", operationStaffSchema, "operationstaffs");
module.exports = OperationStaff;
