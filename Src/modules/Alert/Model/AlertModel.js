const mongoose = require("mongoose");

const ALERT_TYPES = ["MAINTENANCE", "INSURANCE", "REGISTRATION", "OTHER"];
const ALERT_STATUSES = ["ACTIVE", "RESOLVED", "DISMISSED"];
const ALERT_PRIORITIES = ["LOW", "MEDIUM", "HIGH"];

const alertSchema = new mongoose.Schema(
    {
        type: {
            type: String,
            enum: ALERT_TYPES,
            required: true,
        },
        vehicleId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Vehicle",
            required: true,
        },
        status: {
            type: String,
            enum: ALERT_STATUSES,
            default: "ACTIVE",
        },
        priority: {
            type: String,
            enum: ALERT_PRIORITIES,
            default: "MEDIUM",
        },
        message: {
            type: String,
            required: true,
        },
        metadata: {
            type: mongoose.Schema.Types.Mixed,
        },
        resolvedAt: {
            type: Date,
        },
        resolvedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
        },
        isDeleted: {
            type: Boolean,
            default: false,
        },
    },
    { timestamps: true }
);

// Indexes for fast lookup
alertSchema.index({ vehicleId: 1, status: 1 });
alertSchema.index({ type: 1, status: 1 });
alertSchema.index({ createdAt: -1 });

module.exports = {
    Alert: mongoose.model("Alert", alertSchema),
    ALERT_TYPES,
    ALERT_STATUSES,
    ALERT_PRIORITIES,
};
