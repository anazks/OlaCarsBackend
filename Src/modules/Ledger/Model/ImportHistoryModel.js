const mongoose = require("mongoose");
const { ROLES } = require("../../../shared/constants/roles");

const importHistorySchema = new mongoose.Schema(
    {
        fileName: {
            type: String,
            required: false,
        },
        startedBy: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            refPath: "startedByRole",
        },
        startedByRole: {
            type: String,
            required: true,
            enum: Object.values(ROLES),
        },
        status: {
            type: String,
            required: true,
            enum: ["STARTED", "COMPLETED", "FAILED"],
            default: "STARTED",
        },
        startTime: {
            type: Date,
            default: Date.now,
        },
        endTime: {
            type: Date,
        },
        totalRows: {
            type: Number,
            default: 0,
        },
        completedRows: {
            type: Number,
            default: 0,
        },
        failedRows: {
            type: Number,
            default: 0,
        },
        duration: {
            type: Number, // In seconds
            default: 0,
        },
        errors: [
            {
                row: { type: Number, required: true },
                error: { type: String, required: true },
            },
        ],
    },
    { timestamps: true }
);

module.exports = mongoose.model("ImportHistory", importHistorySchema);
