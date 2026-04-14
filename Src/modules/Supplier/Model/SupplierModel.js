const mongoose = require("mongoose");
const { ROLES } = require("../../../shared/constants/roles");

const supplierSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            unique: true,
            trim: true,
        },
        contactPerson: {
            type: String,
            trim: true,
        },
        email: {
            type: String,
            trim: true,
            lowercase: true,
        },
        phone: {
            type: String,
            trim: true,
        },
        address: {
            type: String,
        },
        category: {
            type: String,
            enum: ["Vehicles", "Parts", "Spare Parts", "Services", "Insurance", "Office Supplies", "IT Equipment", "Marketing", "Other", "General"],
            default: "General",
        },
        isActive: {
            type: Boolean,
            default: true,
        },
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            refPath: "creatorRole",
        },
        creatorRole: {
            type: String,
            required: true,
            enum: [
                ROLES.ADMIN,
                ROLES.OPERATIONADMIN,
                ROLES.FINANCEADMIN,
                ROLES.COUNTRYMANAGER,
                ROLES.BRANCHMANAGER,
                ROLES.OPERATIONSTAFF,
                ROLES.FINANCESTAFF,
            ],
        },
        isDeleted: {
            type: Boolean,
            default: false,
        },
    },
    { timestamps: true }
);

// Basic search index for active suppliers
supplierSchema.index({ name: 1, isActive: 1, isDeleted: 1 });

module.exports = mongoose.model("Supplier", supplierSchema);
