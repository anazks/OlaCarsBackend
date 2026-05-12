const mongoose = require("mongoose");

const callLogSchema = new mongoose.Schema(
    {
        call_id: {
            type: String,
            required: true,
            unique: true,
        },
        customer_phone: {
            type: String,
        },
        customer_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Driver", // We use Driver model for customers in this system
        },
        is_existing_customer: {
            type: Boolean,
            default: false,
        },
        intent: {
            type: String,
            enum: [
                "vehicle_inquiry",
                "lease_inquiry",
                "lead_captured",
                "vehicle_booked",
                "account_status",
                "general_support",
                "needs_follow_up",
            ],
        },
        outcome: {
            type: String,
            enum: ["resolved", "lead_captured", "booking_created", "pending"],
        },
        summary: {
            type: String,
        },
        duration_seconds: {
            type: Number,
        },
        timestamp: {
            type: Date,
            default: Date.now,
        },
    },
    { timestamps: true }
);

module.exports = mongoose.model("CallLog", callLogSchema);
