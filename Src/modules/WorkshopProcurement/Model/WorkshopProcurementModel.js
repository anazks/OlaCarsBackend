const mongoose = require("mongoose");

const WorkshopProcurementSchema = new mongoose.Schema(
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
        status: {
            type: String,
            enum: ["PENDING", "APPROVED", "REJECTED", "CONVERTED_TO_PO"],
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
            enum: ["WORKSHOPMANAGER", "BRANCHMANAGER", "ADMIN"],
        },
        rejectionReason: {
            type: String,
        },
        supplier: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Supplier",
        },
        notes: {
            type: String,
        }
    },
    { timestamps: true }
);

module.exports = mongoose.model("WorkshopProcurement", WorkshopProcurementSchema);
