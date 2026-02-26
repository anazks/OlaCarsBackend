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
        lastLoginAt: {
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
    { timestamps: true }
);

module.exports = mongoose.model("OperationStaff", operationStaffSchema);
