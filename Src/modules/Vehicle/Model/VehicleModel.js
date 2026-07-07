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
    "PRE-BOOKED",
    "W. GROUP ACTIVE",
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
        handlingStaff: {
            type: mongoose.Schema.Types.ObjectId,
            refPath: 'handlingStaffModel'
        },
        handlingStaffModel: {
            type: String,
            enum: ['OperationStaff', 'FinanceStaff']
        },
        fleet: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Fleet'
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
                enum: ["Sedan", "SEDAN", "sedan", "SUV", "Pickup", "PICKUP", "Van", "VAN", "Luxury", "LUXURY", "Commercial", "COMMERCIAL", "MUV"],
            },
            fuelType: {
                type: String,
                enum: ["Petrol", "Diesel", "Hybrid", "Electric", "EV", "Gasoline", "GASOLINE", "gasoline"],
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
            condition: { type: String, enum: ["New", "Used"] },
            weeklyRent: { type: Number, default: 0 },
            sellingValue: { type: Number, default: 0 },
            leaseDurationWeeks: { type: Number, default: 260 },
            fleetNumber: { type: String, trim: true },
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
            maintenanceThresholdKm: { type: Number, default: 1000 },
            lastMaintenanceOdometer: { type: Number, default: 0 },
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
                ROLES.FINANCEADMIN,
                ROLES.OPERATIONADMIN,
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
        currentDriver: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Driver",
        },
        tempDriver: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Driver",
        },
    },
    { timestamps: true }
);

// Pre-validate hook to handle empty/null VINs and auto-calculate weeklyRent
vehicleSchema.pre("validate", async function () {
    if (this.fleet) {
        try {
            const Fleet = mongoose.model('Fleet');
            const fleetDoc = await Fleet.findById(this.fleet);
            if (fleetDoc) {
                if (!this.basicDetails) this.basicDetails = {};
                this.basicDetails.fleetNumber = fleetDoc.fleetNumber;
                if (fleetDoc.assignedStaff) {
                    this.handlingStaff = fleetDoc.assignedStaff;
                    this.handlingStaffModel = fleetDoc.assignedStaffModel;
                }
            }
        } catch (err) {
            console.error("Error syncing fleet details in VehicleModel pre-validate hook:", err);
        }
    } else {
        if (this.basicDetails && this.basicDetails.fleetNumber) {
            this.basicDetails.fleetNumber = undefined;
        }
        this.handlingStaff = undefined;
        this.handlingStaffModel = undefined;
    }

    if (this.basicDetails) {
        const vinVal = this.basicDetails.vin;
        if (vinVal === "" || vinVal === null || vinVal === undefined) {
            this.basicDetails.vin = undefined;
        } else if (typeof vinVal === "string") {
            const clean = vinVal.trim().toUpperCase();
            if (!clean || clean === "N/A" || clean === "NA" || clean === "-" || clean === "—" || clean === "NULL" || clean === "UNDEFINED") {
                this.basicDetails.vin = undefined;
            }
        }
    }

    // Auto-calculate weeklyRent from purchasePrice / leaseDurationWeeks (default 260 = 5 years)
    // Only if purchasePrice exists and weeklyRent is not manually set
    if (
        this.purchaseDetails?.purchasePrice > 0 &&
        (!this.basicDetails?.weeklyRent || this.basicDetails.weeklyRent === 0)
    ) {
        if (!this.basicDetails) this.basicDetails = {};
        const durationWeeks = this.basicDetails.leaseDurationWeeks || 260; // 5 years * 52 weeks
        this.basicDetails.weeklyRent = Math.round((this.purchaseDetails.purchasePrice / durationWeeks) * 100) / 100;
    }
});

// Pre-update hook to handle empty/null VINs and sync fleet properties for findOneAndUpdate
vehicleSchema.pre("findOneAndUpdate", async function () {
    const update = this.getUpdate();
    
    // 1. Sync fleet and handlingStaff properties if fleet is updated
    let hasFleetUpdate = false;
    let fleetId = null;
    
    if (update.$set) {
        if (update.$set.fleet !== undefined) {
            hasFleetUpdate = true;
            fleetId = update.$set.fleet;
        }
    } else if (update.fleet !== undefined) {
        hasFleetUpdate = true;
        fleetId = update.fleet;
    }
    
    if (hasFleetUpdate) {
        if (fleetId) {
            try {
                const Fleet = mongoose.model('Fleet');
                const fleetDoc = await Fleet.findById(fleetId);
                if (fleetDoc) {
                    if (update.$set) {
                        update.$set["basicDetails.fleetNumber"] = fleetDoc.fleetNumber;
                        update.$set.handlingStaff = fleetDoc.assignedStaff;
                        update.$set.handlingStaffModel = fleetDoc.assignedStaffModel;
                    } else {
                        if (!update.basicDetails) update.basicDetails = {};
                        update.basicDetails.fleetNumber = fleetDoc.fleetNumber;
                        update.handlingStaff = fleetDoc.assignedStaff;
                        update.handlingStaffModel = fleetDoc.assignedStaffModel;
                    }
                }
            } catch (err) {
                console.error("Error syncing fleet details in VehicleModel pre-findOneAndUpdate hook:", err);
            }
        } else {
            if (update.$set) {
                update.$set["basicDetails.fleetNumber"] = "";
                update.$set.handlingStaff = null;
                update.$set.handlingStaffModel = null;
            } else {
                if (update.basicDetails) update.basicDetails.fleetNumber = "";
                update.handlingStaff = null;
                update.handlingStaffModel = null;
            }
        }
    }

    // 2. Handle empty/null VINs
    if (update.$set) {
        const vinVal = update.$set["basicDetails.vin"];
        if (vinVal === "" || vinVal === null || vinVal === undefined) {
            update.$set["basicDetails.vin"] = undefined;
        } else if (typeof vinVal === "string") {
            const clean = vinVal.trim().toUpperCase();
            if (!clean || clean === "N/A" || clean === "NA" || clean === "-" || clean === "—" || clean === "NULL" || clean === "UNDEFINED") {
                update.$set["basicDetails.vin"] = undefined;
            }
        }
    } else if (update.basicDetails) {
        const vinVal = update.basicDetails.vin;
        if (vinVal === "" || vinVal === null || vinVal === undefined) {
            update.basicDetails.vin = undefined;
        } else if (typeof vinVal === "string") {
            const clean = vinVal.trim().toUpperCase();
            if (!clean || clean === "N/A" || clean === "NA" || clean === "-" || clean === "—" || clean === "NULL" || clean === "UNDEFINED") {
                update.basicDetails.vin = undefined;
            }
        }
    }
});

// Performance Indexes
vehicleSchema.index({ status: 1 });
vehicleSchema.index({ "purchaseDetails.branch": 1 });
vehicleSchema.index({ "legalDocs.registrationNumber": 1 });
// Expiry Alert Indexes
// vehicleSchema.index({ "insurancePolicy.expiryDate": 1 }); // Removed as moved to Insurance collection
vehicleSchema.index({ "legalDocs.registrationExpiry": 1 });
vehicleSchema.index({ "legalDocs.roadTaxExpiry": 1 });

module.exports = {
    Vehicle: mongoose.model("Vehicle", vehicleSchema),
    VEHICLE_STATUSES,
};
