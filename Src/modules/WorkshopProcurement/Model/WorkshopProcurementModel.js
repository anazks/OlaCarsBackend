const mongoose = require("mongoose");

const WorkshopProcurementSchema = new mongoose.Schema(
    {
        requestNumber: {
            type: String,
            unique: true,
            required: true,
        },
        creationType: {
            type: String,
            enum: ["PARTS_BASED", "VEHICLE_BASED"],
            default: "PARTS_BASED",
        },
        priority: {
            type: String,
            enum: ["LOW", "MEDIUM", "HIGH"],
            default: "MEDIUM",
        },
        technicianName: {
            type: String,
        },
        isNewItem: {
            type: Boolean,
            default: false,
        },
        itemCode: {
            type: String,
        },
        partNumber: {
            type: String,
        },
        partName: {
            type: String,
        },
        category: {
            type: String,
            enum: ["Engine", "Electrical", "Suspension", "Lubricants", "Consumables", "Body", "Tyres", "Other"],
            default: "Other",
        },
        unitOfMeasure: {
            type: String,
            default: "PCS",
        },
        fullSizePhoto: {
            type: String,
        },
        closeUpPhoto: {
            type: String,
        },
        // Vehicle details (for VEHICLE_BASED PRs)
        vin: {
            type: String,
        },
        vehicleMake: {
            type: String,
        },
        vehicleModel: {
            type: String,
        },
        vehicleYear: {
            type: String,
        },
        plateNumber: {
            type: String,
        },
        // Legacy/existing part reference if linked to InventoryPart
        part: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "InventoryPart",
        },
        quantity: {
            type: Number,
            required: true,
            min: 1,
        },
        status: {
            type: String,
            enum: [
                "PENDING",
                "RETURNED_TO_TECHNICIAN",
                "APPROVED",
                "PENDING_FINANCE_APPROVAL",
                "COST_APPROVED",
                "IN_TRANSIT",
                "RECEIVED",
                "REJECTED",
                "CONVERTED_TO_PO",
                "WAITING_QUOTATION"
            ],
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
            enum: ["WORKSHOPSTAFF", "WORKSHOPMANAGER", "ADMIN", "OPERATIONSTAFF", "BRANCHMANAGER"],
        },
        approvedBy: {
            type: mongoose.Schema.Types.ObjectId,
            refPath: "approvedByRole",
        },
        approvedByRole: {
            type: String,
            enum: ["WORKSHOPMANAGER", "BRANCHMANAGER", "ADMIN", "FINANCEADMIN", "COUNTRYMANAGER"],
        },
        rejectionReason: {
            type: String,
        },
        returnReason: {
            type: String,
        },
        // Sourcing & Logistics Options (added at approval stage)
        preferredSupplier: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Supplier",
        },
        preferredSupplierName: {
            type: String,
        },
        preferredBrand: {
            type: String,
        },
        qualityPreference: {
            type: String,
            enum: ["GENUINE_OEM", "AFTERMARKET_ANY_BRAND"],
            default: "GENUINE_OEM",
        },
        transportationMode: {
            type: String,
            enum: ["SEA", "AIR", "LAND"],
            default: "SEA",
        },
        // Verification Check
        isInformationVerified: {
            type: Boolean,
            default: false,
        },
        verifiedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
        },
        verifiedByName: {
            type: String,
        },
        verifiedAt: {
            type: Date,
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
                editorName: { type: String },
                action: { type: String },
                previousStatus: { type: String },
                newStatus: { type: String },
                changesSummary: { type: String },
                notes: { type: String },
            }
        ]
    },
    { timestamps: true }
);

module.exports = mongoose.model("WorkshopProcurement", WorkshopProcurementSchema);
