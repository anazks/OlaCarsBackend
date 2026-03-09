const mongoose = require("mongoose");

const systemSettingsSchema = new mongoose.Schema(
    {
        key: {
            type: String,
            required: true,
            unique: true,
            trim: true,
        },
        value: {
            type: mongoose.Schema.Types.Mixed,
            required: true,
        },
        description: {
            type: String,
            trim: true,
        },
        updatedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Admin",
        },
    },
    {
        timestamps: true,
    }
);

module.exports = mongoose.model("SystemSettings", systemSettingsSchema);
