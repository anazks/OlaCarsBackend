const mongoose = require("mongoose");
const { ROLES } = require("../../../shared/constants/roles");

const VEHICLE_STATUSES = [
    "PENDING ENTRY",
    "DOCUMENTS REVIEW",
    "INSPECTION REQUIRED",
    "INSPECTION FAILED",
    "REPAIR IN PROGRESS",
    "ACCOUNTING SETUP",
    "GPS ACTIVATION",
    "BRANCH MANAGER APPROVAL",
    "ACTIVE — AVAILABLE",
    "ACTIVE — RENTED",
    "ACTIVE — MAINTENANCE",
    "RETIRED",
];

const checklistItemSchema = new mongoose.Schema({
    name: { type: String, required: true },
    condition: { type: String }, // Good/Fair/Poor, Yes/No, OK/Low/Leak, etc.
    notes: { type: String },
    isMandatoryFail: { type: Boolean, default: false },
});

const vehicleSchema = new mongoose.Schema(
    {
        status: {
            type: String,
            enum: VEHICLE_STATUSES,
            default: "PENDING ENTRY",
        },

        // 1. Procurement & Purchase Details
        purchaseDetails: {
            purchaseOrder: { type: mongoose.Schema.Types.ObjectId, ref: "PurchaseOrder" },
            vendorName: { type: String },
            purchaseDate: { type: Date },
            purchasePrice: { type: Number },
            currency: { type: String },
            paymentMethod: { type: String, enum: ["Cash", "Bank Transfer", "Finance"] },
            financeDetails: {
                lenderName: String,
                loanAmount: Number,
                termMonths: Number,
                monthlyInstalment: Number,
            },
            branch: { type: mongoose.Schema.Types.ObjectId, ref: "Branch", required: true },
            purchaseReceipt: { type: String }, // file url
        },

        // 2. Basic Details
        basicDetails: {
            make: { type: String, required: true },
            model: { type: String, required: true },
            year: { type: Number, required: true },
            category: {
                type: String,
                enum: ["Sedan", "SUV", "Pickup", "Van", "Luxury", "Commercial"],
            },
            fuelType: {
                type: String,
                enum: ["Petrol", "Diesel", "Hybrid", "Electric"],
            },
            transmission: { type: String, enum: ["Automatic", "Manual"] },
            engineCapacity: { type: Number },
            colour: { type: String },
            seats: { type: Number },
            vin: {
                type: String,
                required: true,
                uppercase: true,
                trim: true
            },
            engineNumber: { type: String },
            bodyType: {
                type: String,
                enum: ["Hatchback", "Saloon", "Coupe", "Convertible", "Truck"],
            },
            odometer: { type: Number },
            gpsSerialNumber: { type: String },
        },

        // 3. Registration & Legal Documents
        legalDocs: {
            registrationCertificate: { type: String },
            registrationNumber: { type: String },
            registrationExpiry: { type: Date },
            roadTaxDisc: { type: String },
            roadTaxExpiry: { type: Date },
            numberPlateFront: { type: String },
            numberPlateRear: { type: String },
            roadworthinessCertificate: { type: String },
            roadworthinessExpiry: { type: Date },
            transferOfOwnership: { type: String },
        },

        // 4. Insurance Policy
        insurancePolicy: {
            insuranceType: {
                type: String,
                enum: ["Comprehensive", "Third-Party", "Fleet Policy"],
            },
            providerName: { type: String },
            policyNumber: { type: String },
            startDate: { type: Date },
            expiryDate: { type: Date },
            premiumAmount: { type: Number },
            coverageAmount: { type: Number },
            policyDocument: { type: String },
            excessAmount: { type: Number },
            namedDrivers: [{ type: String }],
            claimsHistory: { type: String },
        },

        // 5. Importation & Landed Cost
        importationDetails: {
            isImported: { type: Boolean, default: false },
            countryOfOrigin: { type: String },
            shippingReference: { type: String },
            portOfEntry: { type: String },
            customsDeclarationNumber: { type: String },
            arrivalDate: { type: Date },
            shippingCost: { type: Number },
            customsDuty: { type: Number },
            portHandling: { type: Number },
            localTransport: { type: Number },
            otherCharges: { type: Number },
            landedCost: { type: Number }, // Computed
            customsClearanceCertificate: { type: String },
            importPermit: { type: String },
        },

        // 6. Inspection Checklist
        inspection: {
            checkedBy: { type: mongoose.Schema.Types.ObjectId, refPath: "inspection.checkedByRole" },
            checkedByRole: { type: String, enum: [ROLES.OPERATIONSTAFF, ROLES.BRANCHMANAGER] },
            date: { type: Date },
            status: { type: String, enum: ["Pending", "Passed", "Failed"], default: "Pending" },
            checklistItems: [checklistItemSchema],
            exteriorPhotos: {
                type: [{ type: String }],
                validate: [v => v == null || v.length >= 6, "Minimum 6 exterior photos required for inspection."]
            },
            odometerPhoto: { type: String },
        },

        // 7. Accounting
        accountingSetup: {
            depreciationMethod: { type: String, enum: ["Straight-Line", "Reducing Balance"] },
            usefulLifeYears: { type: Number },
            residualValue: { type: Number },
            isSetupComplete: { type: Boolean, default: false },
        },

        // 8. GPS
        gpsConfiguration: {
            isActivated: { type: Boolean, default: false },
            geofenceZone: { type: String },
            speedLimitThreshold: { type: Number },
            idleTimeAlertMins: { type: Number, default: 30 },
            mileageSyncFrequencyHrs: { type: Number, default: 1 },
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
                ROLES.OPERATIONSTAFF,
                ROLES.BRANCHMANAGER,
                ROLES.FINANCESTAFF,
                ROLES.COUNTRYMANAGER,
                ROLES.ADMIN,
            ],
        },

        // 9. Audit Trail
        statusHistory: [
            {
                status: { type: String, enum: VEHICLE_STATUSES },
                changedBy: { type: mongoose.Schema.Types.ObjectId, refPath: "statusHistory.changedByRole" },
                changedByRole: { type: String },
                timestamp: { type: Date, default: Date.now },
                notes: { type: String },
            }
        ],
        isDeleted: { type: Boolean, default: false },
    },
    { timestamps: true }
);

// Performance Indexes
vehicleSchema.index({ status: 1 });
vehicleSchema.index({ "purchaseDetails.branch": 1 });
vehicleSchema.index({ "legalDocs.registrationNumber": 1 });
vehicleSchema.index({ "basicDetails.vin": 1 });

module.exports = {
    Vehicle: mongoose.model("Vehicle", vehicleSchema),
    VEHICLE_STATUSES,
};
