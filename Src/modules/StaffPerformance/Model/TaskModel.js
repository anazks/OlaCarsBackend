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
        assignedTo: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            refPath: "assignedToRoleModel",
        },
        assignedToRole: {
            type: String,
            required: true,
        },
        assignedToRoleModel: {
            type: String,
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

taskSchema.index({ assignedTo: 1, status: 1 });
taskSchema.index({ assignedBy: 1 });

module.exports = mongoose.model("Task", taskSchema);
