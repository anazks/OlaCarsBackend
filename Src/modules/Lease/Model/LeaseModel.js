const mongoose = require("mongoose");

const leaseSchema = new mongoose.Schema(
    {
        driver: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Driver",
            required: true,
        },
        vehicle: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Vehicle",
            required: true,
        },
        durationMonths: {
            type: Number,
            required: true,
            min: 1,
        },
        monthlyRent: {
            type: Number,
            required: true,
            min: 0,
        },
        startDate: {
            type: Date,
            default: Date.now,
        },
        endDate: {
            type: Date,
        },
        status: {
            type: String,
            enum: ["ACTIVE", "COMPLETED", "TERMINATED"],
            default: "ACTIVE",
        },
        agreementVersion: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "AgreementVersion",
        },
        generatedS3Key: {
            type: String,
        },
        signedS3Key: {
            type: String,
        },
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            refPath: "creatorRole",
            required: true,
        },
        creatorRole: {
            type: String,
            required: true,
        },
        notes: {
            type: String,
            trim: true,
        },
    },
    { timestamps: true }
);

// Middleware to calculate endDate based on durationMonths
leaseSchema.pre("save", async function () {
    if (this.isModified("startDate") || this.isModified("durationMonths")) {
        const end = new Date(this.startDate);
        end.setMonth(end.getMonth() + this.durationMonths);
        this.endDate = end;
    }
});

leaseSchema.index({ driver: 1, status: 1 });
leaseSchema.index({ vehicle: 1, status: 1 });

module.exports = mongoose.model("Lease", leaseSchema);
