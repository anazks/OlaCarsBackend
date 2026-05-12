const mongoose = require("mongoose");

const leadSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true,
        },
        phone: {
            type: String,
            required: true,
            trim: true,
        },
        interest: {
            type: String,
            trim: true,
        },
        source: {
            type: String,
            default: "VOICE_AGENT",
            enum: ["VOICE_AGENT", "WEBSITE", "MANUAL", "OTHER"],
        },
        notes: {
            type: String,
        },
    },
    { timestamps: true }
);

module.exports = mongoose.model("Lead", leadSchema);
