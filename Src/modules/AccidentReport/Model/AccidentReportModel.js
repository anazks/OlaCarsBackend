const mongoose = require("mongoose");

const REPORT_STATUSES = ["SUBMITTED", "UNDER_REVIEW", "RESOLVED", "CLOSED"];

const accidentReportSchema = new mongoose.Schema(
    {
        // Driver who submitted
        driver: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Driver",
            required: true,
        },
        driverName: { type: String, required: true },
        driverEmail: { type: String, required: true },

        // Vehicle confirmation
        vehicleNumber: { type: String, required: true, uppercase: true, trim: true },
        branch: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Branch",
            required: true,
        },

        // Contact info at the time of accident
        alternativeMobile: { type: String, required: true },
        alternativeEmail: { type: String },

        // Accident details
        accidentLocation: { type: String, required: true },
        accidentDate: { type: Date, required: true, default: Date.now },
        description: { type: String, required: true },

        // Up to 5 images stored in S3/local
        images: [{ type: String }],  // array of URLs

        // Review
        status: {
            type: String,
            enum: REPORT_STATUSES,
            default: "SUBMITTED",
        },
        reviewNotes: { type: String },
        reviewedBy: {
            type: mongoose.Schema.Types.ObjectId,
            refPath: "reviewedByModel",
        },
        reviewedByModel: {
            type: String,
            enum: ["BranchManager", "CountryManager", "FinanceAdmin", "Admin"],
        },
        resolvedAt: { type: Date },
    },
    { timestamps: true }
);

accidentReportSchema.index({ branch: 1, status: 1 });
accidentReportSchema.index({ driver: 1 });
accidentReportSchema.index({ createdAt: -1 });

module.exports = {
    AccidentReport: mongoose.model("AccidentReport", accidentReportSchema),
    REPORT_STATUSES,
};
