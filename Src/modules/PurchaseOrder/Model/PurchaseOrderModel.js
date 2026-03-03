const mongoose = require("mongoose");
const { ROLES } = require("../../../shared/constants/roles");

const purchaseOrderSchema = new mongoose.Schema(
    {
        purchaseOrderNumber: {
            type: String,
            required: true,
            unique: true,
        },
        status: {
            type: String,
            enum: ["WAITING", "APPROVED", "REJECTED"],
            default: "WAITING",
        },
        items: [
            {
                itemName: { type: String, required: true },
                quantity: { type: Number, required: true, default: 1 },
                description: { type: String },
                unitPrice: { type: Number, required: true },
            }
        ],
        totalAmount: {
            type: Number,
            required: true,
        },
        purchaseOrderDate: {
            type: Date,
            default: Date.now,
        },
        paymentDate: {
            type: Date,
        },
        branch: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Branch",
            required: true,
        },
        supplier: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Supplier",
            required: true,
        },
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            refPath: "creatorRole",
        },
        creatorRole: {
            type: String,
            required: true,
            enum: [ROLES.ADMIN, ROLES.OPERATIONADMIN, ROLES.FINANCEADMIN, ROLES.COUNTRYMANAGER, ROLES.BRANCHMANAGER, ROLES.OPERATIONSTAFF, ROLES.FINANCESTAFF, ROLES.WORKSHOPSTAFF],
        },
        approvedBy: {
            type: mongoose.Schema.Types.ObjectId,
            refPath: "approverRole",
        },
        approverRole: {
            type: String,
            enum: [ROLES.ADMIN, ROLES.OPERATIONADMIN, ROLES.FINANCEADMIN, ROLES.COUNTRYMANAGER, ROLES.BRANCHMANAGER],
        },
        isEdited: {
            type: Boolean,
            default: false,
        },
        editHistory: [
            {
                editedAt: { type: Date, default: Date.now },
                editedBy: { type: mongoose.Schema.Types.ObjectId, required: true, refPath: "editHistory.editorRole" },
                editorRole: { type: String, required: true },
                previousStatus: { type: String, required: true },
                changesSummary: { type: String, required: true },
            }
        ],
    },
    { timestamps: true }
);

module.exports = mongoose.model("PurchaseOrder", purchaseOrderSchema);
