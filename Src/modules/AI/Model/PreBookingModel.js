const mongoose = require("mongoose");

const preBookingSchema = new mongoose.Schema(
    {
        vehicle: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Vehicle",
            required: true,
        },
        driver: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Driver", // Reference to the DRAFT driver
        },
        phone: {
            type: String,
            required: true,
            trim: true,
        },
        status: {
            type: String,
            enum: ["PENDING", "CONVERTED", "CANCELLED"],
            default: "PENDING",
        },
        bookingDate: {
            type: Date,
            default: Date.now,
        },
        notes: {
            type: String,
            trim: true,
        }
    },
    { timestamps: true }
);

preBookingSchema.index({ phone: 1, status: 1 });
preBookingSchema.index({ vehicle: 1, status: 1 });

module.exports = mongoose.model("PreBooking", preBookingSchema);
