const mongoose = require("mongoose");
const { ROLES } = require("../../../shared/constants/roles");

const purchaseOrderSchema = new mongoose.Schema(
    {
        status: {
            type: String,
            enum: ["WAITING", "APPROVED", "REJECTED"],
            default: "WAITING",
        },
        priceOfVehicle: {
            type: Number,
            required: true,
        },
        vehicleNumber: {
            type: String,
            required: true,
        },
        branch: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Branch",
            required: true,
        },
        supplier: {
            type: String,
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
            enum: [ROLES.BRANCHMANAGER, ROLES.OPERATIONSTAFF, ROLES.FINANCESTAFF],
        },
        approvedBy: {
            type: mongoose.Schema.Types.ObjectId,
            refPath: "approverRole",
        },
        approverRole: {
            type: String,
            enum: [
                ROLES.COUNTRYMANAGER,
                ROLES.OPERATIONADMIN,
                ROLES.FINANCEADMIN,
                ROLES.ADMIN,
            ],
        },
    },
    { timestamps: true }
);

module.exports = mongoose.model("PurchaseOrder", purchaseOrderSchema);
