const mongoose = require("mongoose");
const { ROLES } = require("../../../shared/constants/roles"); // Adjust path if needed

const insuranceSchema = new mongoose.Schema(
    {
        provider: {
            type: String,
            required: true
        },
        policyNumber: {
            type: String,
            required: true,
            unique: true
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
            required: true
        },
        expiryDate: {
            type: Date,
            required: true,
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
            enum: [ROLES.ADMIN, ROLES.FINANCEADMIN, ROLES.OPERATIONADMIN, ROLES.COUNTRYMANAGER, ROLES.BRANCHMANAGER] 
            // Made this match standard roles, as user mentioned Country/Branch Manager should post. Add role constants here.
        }
    },
    {
        timestamps: true
    }
);

module.exports = mongoose.model("Insurance", insuranceSchema);
