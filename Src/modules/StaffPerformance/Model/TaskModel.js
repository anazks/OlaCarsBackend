const mongoose = require("mongoose");

const taskSchema = new mongoose.Schema(
    {
        title: {
            type: String,
            required: true,
            trim: true,
        },
        description: {
            type: String,
            required: true,
        },
        targetType: {
            type: String,
            enum: ["COUNTRY", "BRANCH", "STAFF"],
            required: true,
        },
        targetId: {
            type: String, // Can be country code, branchId, or userId
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
        },
        status: {
            type: String,
            enum: ["PENDING", "IN_PROGRESS", "COMPLETED", "CANCELLED"],
            default: "PENDING",
        },
        dueDate: {
            type: Date,
            required: true,
        },
        completedAt: {
            type: Date,
        },
        notes: {
            type: String,
            trim: true,
        },
    },
    { timestamps: true }
);

taskSchema.index({ targetType: 1, targetId: 1, status: 1 });
taskSchema.index({ assignedBy: 1 });

module.exports = mongoose.model("Task", taskSchema);
