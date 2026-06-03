const mongoose = require("mongoose");

const WriteOffSchema = new mongoose.Schema(
    {
        requestNumber: {
            type: String,
            unique: true,
            required: true,
        },
        part: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "InventoryPart",
            required: true,
        },
        quantity: {
            type: Number,
            required: true,
            min: 1,
        },
        unitCost: {
            type: Number,
            required: true,
            min: 0,
        },
        amountLoss: {
            type: Number,
            required: true,
            min: 0,
        },
        reason: {
            type: String,
            required: true,
        },
        documents: {
            type: [String],
            default: [],
        },
        status: {
            type: String,
            enum: ["PENDING", "APPROVED", "REJECTED"],
            default: "PENDING",
        },
        branch: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Branch",
            required: true,
        },
        requestedBy: {
            type: mongoose.Schema.Types.ObjectId,
            refPath: "requestedByRole",
            required: true,
        },
        requestedByRole: {
            type: String,
            required: true,
            enum: ["WORKSHOPSTAFF", "WORKSHOPMANAGER", "ADMIN"],
        },
        approvedBy: {
            type: mongoose.Schema.Types.ObjectId,
            refPath: "approvedByRole",
        },
        approvedByRole: {
            type: String,
            enum: ["FINANCEADMIN", "ADMIN"],
        },
        rejectionNote: {
            type: String,
        },
        approvalNote: {
            type: String,
        },
    },
    { timestamps: true }
);

module.exports = mongoose.model("WriteOff", WriteOffSchema);
