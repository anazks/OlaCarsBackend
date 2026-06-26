const mongoose = require("mongoose");
const { ROLES } = require("../../../shared/constants/roles");

const vehiclePolicySchema = new mongoose.Schema(
    {
        vehicle: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Vehicle",
            required: true,
            index: true
        },
        insurance: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Insurance",
            required: true,
            index: true
        },
        policyNumber: {
            type: String
        },
        startDate: {
            type: Date
        },
        expiryDate: {
            type: Date,
            index: true
        },
        insuredValue: {
            type: Number
        },
        certificate: {
            type: String // S3 Key for individual vehicle certificate if any
        },
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
        }
    },
    {
        timestamps: true
    }
);

// Performance Indexes
vehiclePolicySchema.index({ vehicle: 1, status: 1 });

module.exports = mongoose.model("VehiclePolicy", vehiclePolicySchema);
