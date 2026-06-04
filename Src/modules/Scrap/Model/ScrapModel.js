const mongoose = require("mongoose");

const ScrapSchema = new mongoose.Schema(
    {
        partName: {
            type: String,
            required: true,
        },
        partNumber: {
            type: String,
        },
        quantity: {
            type: Number,
            required: true,
            min: 1,
        },
        description: {
            type: String,
        },
        status: {
            type: String,
            required: true,
            enum: ["DISPOSED", "PENDING_DISPOSAL", "RECYCLED", "PENDING_SALE_APPROVAL", "REJECTED"],
            default: "PENDING_DISPOSAL",
        },
        type: {
            type: String,
            required: true,
            enum: ["Valuable", "Non Valuable"],
            default: "Non Valuable",
        },
        scrappedBy: {
            type: String,
            required: true,
        },
        scrappedDate: {
            type: Date,
            default: Date.now,
        },
        branch: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Branch",
        },
        currentAmount: {
            type: Number,
        },
        buyerName: {
            type: String,
        },
        saleApproved: {
            type: Boolean,
            default: false,
        },
        rejectionNote: {
            type: String,
        }
    },
    { timestamps: true }
);

module.exports = mongoose.model("Scrap", ScrapSchema);
