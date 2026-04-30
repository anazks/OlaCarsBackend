const mongoose = require("mongoose");

const targetSchema = new mongoose.Schema(
    {
        targetType: {
            type: String,
            enum: ["COUNTRY", "BRANCH", "STAFF"],
            required: true,
        },
        targetId: {
            type: String, // Can be country code, branchId, or userId
            required: true,
        },
        category: {
            type: String,
            enum: ["DRIVER_ACQUISITION", "RENTAL", "VEHICLE_ACQUISITION"],
            required: true,
        },
        targetValue: {
            type: Number,
            required: true,
            min: 0,
        },
        period: {
            type: String,
            enum: ["WEEKLY", "MONTHLY", "YEARLY"],
            default: "MONTHLY",
        },
        startDate: {
            type: Date,
            required: true,
        },
        endDate: {
            type: Date,
            required: true,
        },
        assignedBy: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            refPath: "assignedByRoleModel",
        },
        assignedByRole: {
            type: String,
            required: true,
        },
        assignedByRoleModel: {
            type: String,
            required: true,
            // This is for dynamic ref
        },
        notes: {
            type: String,
            trim: true,
        },
    },
    { timestamps: true }
);

targetSchema.index({ targetType: 1, targetId: 1, category: 1, startDate: 1 });

module.exports = mongoose.model("Target", targetSchema);
