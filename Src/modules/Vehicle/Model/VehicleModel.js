const mongoose = require("mongoose");
const { ROLES } = require("../../../shared/constants/roles");

const VEHICLE_STATUSES = [
    "PENDING ENTRY",
    "DOCUMENTS REVIEW",
    "INSURANCE VERIFICATION",
    "INSPECTION REQUIRED",
    "INSPECTION FAILED",
    "REPAIR IN PROGRESS",
    "ACCOUNTING SETUP",
    "GPS ACTIVATION",
    "BRANCH MANAGER APPROVAL",
    "ACTIVE — AVAILABLE",
    "ACTIVE — RENTED",
    "ACTIVE — MAINTENANCE",
    "SUSPENDED",
    "TRANSFER PENDING",
    "TRANSFER COMPLETE",
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
            make: { type: String },
            model: { type: String },
            year: { type: Number },
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
                uppercase: true,
                trim: true,
                index: { unique: true, sparse: true }
            },
            engineNumber: { type: String },
            bodyType: {
                type: String,
                enum: ["Hatchback", "Saloon", "Coupe", "Convertible", "Truck"],
            },
            odometer: { type: Number },
            gpsSerialNumber: { type: String },
            monthlyRent: { type: Number, default: 0 },
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
        insurance: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Insurance"
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
            },
            interiorPhotos: {
                type: [{ type: String }],
                default: []
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

        // 9. Suspension Tracking
        suspensionDetails: {
            reason: {
                type: String,
                enum: ["Accident", "Legal", "Police", "Dispute", "Other"],
            },
            suspendedUntil: { type: Date },
            previousStatus: { type: String, enum: VEHICLE_STATUSES },
        },

        // 10. Transfer Tracking
        transferDetails: {
            fromBranch: { type: mongoose.Schema.Types.ObjectId, ref: "Branch" },
            toBranch: { type: mongoose.Schema.Types.ObjectId, ref: "Branch" },
            reason: { type: String },
            estimatedArrival: { type: Date },
            transportMethod: {
                type: String,
                enum: ["Driven", "Flatbed", "Shipping"],
            },
            initiatedBy: { type: mongoose.Schema.Types.ObjectId, refPath: "transferDetails.initiatedByRole" },
            initiatedByRole: { type: String },
            transferDate: { type: Date },
        },

        // 11. Retirement Tracking
        retirementDetails: {
            reason: {
                type: String,
                enum: ["Sold", "Written Off", "End of Life", "Beyond Repair"],
            },
            disposalDate: { type: Date },
            disposalValue: { type: Number },
        },

        // 12. Maintenance Tracking
        maintenanceDetails: {
            type: {
                type: String,
                enum: ["Scheduled", "Unscheduled", "Emergency"],
            },
            estimatedCompletionDate: { type: Date },
            assignedTo: { type: mongoose.Schema.Types.ObjectId, refPath: "maintenanceDetails.assignedToRole" },
            assignedToRole: { type: String },
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

// Pre-validate hook to handle empty string VINs
vehicleSchema.pre("validate", async function () {
    if (this.basicDetails && this.basicDetails.vin === "") {
        this.basicDetails.vin = undefined;
    }
});

// Pre-update hook to handle empty string VINs for findOneAndUpdate
vehicleSchema.pre("findOneAndUpdate", async function () {
    const update = this.getUpdate();
    if (update.$set && update.$set["basicDetails.vin"] === "") {
        update.$set["basicDetails.vin"] = undefined;
    } else if (update.basicDetails && update.basicDetails.vin === "") {
        update.basicDetails.vin = undefined;
    }
});

// Performance Indexes
vehicleSchema.index({ status: 1 });
vehicleSchema.index({ "purchaseDetails.branch": 1 });
vehicleSchema.index({ "legalDocs.registrationNumber": 1 });
vehicleSchema.index({ "basicDetails.vin": 1 }, { unique: true, sparse: true });

// Expiry Alert Indexes
// vehicleSchema.index({ "insurancePolicy.expiryDate": 1 }); // Removed as moved to Insurance collection
vehicleSchema.index({ "legalDocs.registrationExpiry": 1 });
vehicleSchema.index({ "legalDocs.roadTaxExpiry": 1 });

module.exports = {
    Vehicle: mongoose.model("Vehicle", vehicleSchema),
    VEHICLE_STATUSES,
};
