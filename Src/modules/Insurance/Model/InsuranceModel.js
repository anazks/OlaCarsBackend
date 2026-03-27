const mongoose = require("mongoose");
const { ROLES } = require("../../../shared/constants/roles"); // Adjust path if needed

const insuranceSchema = new mongoose.Schema(
    {
        provider: {
            type: String,
            required: false // Optional if supplier is provided
        },
        supplier: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Supplier"
        },
        policyNumber: {
            type: String,
            unique: true,
            sparse: true // Allow multiple nulls/undefined for plans without fixed numbers
        },
        policyType: {
            type: String,
            enum: ["FLEET", "INDIVIDUAL"],
            default: "FLEET"
        },
        coverageType: {
            type: String,
            enum: ["THIRD_PARTY", "COMPREHENSIVE"]
        },
        startDate: {
            type: Date,
        },
        expiryDate: {
            type: Date,
            index: true
        },
        insuredValue: {
            type: Number
        },
        providerContact: {
            name: String,
            phone: String,
            email: String
        },
        documents: {
            policyDocumentUrl: String
        },
        vehicles: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: "Vehicle"
            }
        ],
        status: {
            type: String,
            enum: ["ACTIVE", "EXPIRED", "CANCELLED"],
            default: "ACTIVE"
        },
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            refPath: "createdByModel"
        },
        createdByModel: {
            type: String,
            required: true,
            enum: [
                ROLES.ADMIN, 
                ROLES.FINANCEADMIN, 
                ROLES.OPERATIONADMIN, 
                ROLES.COUNTRYMANAGER, 
                ROLES.BRANCHMANAGER,
                ROLES.FINANCESTAFF
            ] 
        },
        country: {
            type: String, // Storing raw string as per CountryManager / Branch
            required: true,
            trim: true
        }
    },
    {
        timestamps: true
    }
);

module.exports = mongoose.model("Insurance", insuranceSchema);
