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
            enum: ["PENDING", "PENDING_FINANCE_APPROVAL", "APPROVED", "COST_APPROVED", "IN_TRANSIT", "RECEIVED", "REJECTED", "CONVERTED_TO_PO", "WAITING_QUOTATION"],
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
            enum: ["WORKSHOPMANAGER", "BRANCHMANAGER", "ADMIN", "FINANCEADMIN"],
        },
        rejectionReason: {
            type: String,
        },
        supplier: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Supplier",
        },
        supplierDetails: {
            name: { type: String },
            email: { type: String },
            phone: { type: String },
            address: { type: String },
        },
        notes: {
            type: String,
        },
        merchandiserPrice: {
            type: Number,
        },
        merchandiserTotalAmount: {
            type: Number,
        },
        originalTotalAmount: {
            type: Number,
        },
        documents: {
            type: [String],
            default: [],
        },
        rejectionNote: {
            type: String,
        },
        approvalNote: {
            type: String,
        },
        receivedQuantity: {
            type: Number,
        },
        deficitQuantity: {
            type: Number,
        },
        deficitAmount: {
            type: Number,
        },
        surplusQuantity: {
            type: Number,
        },
        surplusAmount: {
            type: Number,
        },
        ledgerEntries: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: "LedgerEntry",
            }
        ],
        inventoryAdded: {
            type: Boolean,
            default: false,
        },
        editHistory: [
            {
                editedAt: { type: Date, default: Date.now },
                editedBy: { type: mongoose.Schema.Types.ObjectId, refPath: "editHistory.editorRole" },
                editorRole: { type: String },
                previousStatus: { type: String },
                changesSummary: { type: String },
            }
        ]
    },
    { timestamps: true }
);

module.exports = mongoose.model("WorkshopProcurement", WorkshopProcurementSchema);
