const mongoose = require("mongoose");
const { ROLES } = require("../../../shared/constants/roles");

// ─── Enums ───────────────────────────────────────────────────────────
const WORK_ORDER_STATUSES = [
    "DRAFT",
    "PENDING_APPROVAL",
    "START",
    "REJECTED",
    "VEHICLE_CHECKED_IN",
    "PARTS_REQUESTED",
    "PARTS_RECEIVED",
    "IN_PROGRESS",
    "PAUSED",
    "ADDITIONAL_WORK_FOUND",
    "QUALITY_CHECK",
    "FAILED_QC",
    "READY_FOR_RELEASE",
    "VEHICLE_RELEASED",
    "INVOICED",
    "CLOSED",
    "CANCELLED",
];

const WORK_ORDER_TYPES = [
    "PREVENTIVE",
    "CORRECTIVE",
    "PRE_ENTRY",
    "ACCIDENT",
    "RETURN_INSPECTION",
    "RECALL",
    "SAFETY_PREP",
    "WEAR_ITEM",
];

const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

const TASK_STATUSES = ["PENDING", "IN_PROGRESS", "COMPLETED", "SKIPPED"];

const PART_STATUSES = ["REQUESTED", "RESERVED", "RECEIVED", "INSTALLED", "RETURNED"];

const LABOUR_ACTIONS = ["CLOCK_IN", "CLOCK_OUT", "PAUSE", "RESUME"];

const QC_RESULTS = ["PENDING", "PASS", "FAIL", "NA"];

// ─── Embedded Sub-schemas ────────────────────────────────────────────

const workOrderTaskSchema = new mongoose.Schema({
    description: { type: String, required: true },
    category: {
        type: String,
        enum: ["Mechanical", "Electrical", "Body", "Tyres", "Fluids", "Other"],
    },
    status: { type: String, enum: TASK_STATUSES, default: "PENDING" },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: "WorkshopStaff" },
    estimatedHours: { type: Number },
    actualHours: { type: Number },
    completedAt: { type: Date },
    notes: { type: String },
});

const workOrderPartSchema = new mongoose.Schema({
    partName: { type: String, required: true },
    partNumber: { type: String },
    quantity: { type: Number, required: true, min: 1 },
    unitCost: { type: Number, default: 0 },
    totalCost: { type: Number, default: 0 },
    source: {
        type: String,
        enum: ["IN_STOCK", "ORDERED", "EXTERNAL_VENDOR"],
        default: "IN_STOCK",
    },
    inventoryPartId: { type: mongoose.Schema.Types.ObjectId, ref: "InventoryPart" },
    purchaseOrderId: { type: mongoose.Schema.Types.ObjectId, ref: "PurchaseOrder" },
    status: { type: String, enum: PART_STATUSES, default: "REQUESTED" },
    receivedDate: { type: Date },
    installedBy: { type: mongoose.Schema.Types.ObjectId, ref: "WorkshopStaff" },
});

const labourEntrySchema = new mongoose.Schema({
    technicianId: { type: mongoose.Schema.Types.ObjectId, ref: "WorkshopStaff", required: true },
    action: { type: String, enum: LABOUR_ACTIONS, required: true },
    timestamp: { type: Date, default: Date.now },
    taskReference: { type: String },
    notes: { type: String },
});

const qcItemSchema = new mongoose.Schema({
    checkItem: { type: String, required: true },
    category: {
        type: String,
        enum: ["Fluids", "Brakes", "Tyres", "Electrical", "Engine", "Body", "Safety", "Suspension", "General", "Repair"],
    },
    result: { type: String, enum: QC_RESULTS, default: "PENDING" },
    notes: { type: String },
    checkedBy: { type: mongoose.Schema.Types.ObjectId, ref: "WorkshopStaff" },
    checkedAt: { type: Date },
});

const photoSchema = new mongoose.Schema({
    url: { type: String, required: true },
    caption: { type: String },
    stage: { type: String, enum: ["CHECK_IN", "IN_PROGRESS", "QC", "RELEASE"], default: "IN_PROGRESS" },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId },
    uploadedAt: { type: Date, default: Date.now },
});

const requiredPhotoSchema = new mongoose.Schema({
    label: { type: String, required: true },
    description: { type: String },
    stage: { type: String, enum: ["CHECK_IN", "IN_PROGRESS", "QC", "RELEASE"], default: "QC" },
    isMandatory: { type: Boolean, default: true },
});

const requiredPartSchema = new mongoose.Schema({
    inventoryPartId: { type: mongoose.Schema.Types.ObjectId, ref: "InventoryPart" },
    partName: { type: String, required: true },
    quantity: { type: Number, required: true, default: 1 },
    unitCost: { type: Number, required: true, default: 0 },
});

// ─── Main Schema ─────────────────────────────────────────────────────

const workOrderSchema = new mongoose.Schema(
    {
        workOrderNumber: { type: String, unique: true, required: true },

        workOrderType: {
            type: String,
            enum: WORK_ORDER_TYPES,
            required: true,
        },

        status: {
            type: String,
            enum: WORK_ORDER_STATUSES,
            default: "DRAFT",
        },

        // References
        vehicleId: { type: mongoose.Schema.Types.ObjectId, ref: "Vehicle", required: true },
        branchId: { type: mongoose.Schema.Types.ObjectId, ref: "Branch", required: true },

        // Priority & SLA
        priority: { type: String, enum: PRIORITIES, default: "MEDIUM" },
        slaDeadline: { type: Date },

        // Description
        faultDescription: { type: String, required: true },
        reportedBy: { type: mongoose.Schema.Types.ObjectId, refPath: "reportedByRole" },
        reportedByRole: { type: String },

        // Assignment
        assignedTechnician: { type: mongoose.Schema.Types.ObjectId, ref: "WorkshopStaff" },
        supervisedBy: { type: mongoose.Schema.Types.ObjectId, refPath: "supervisedByRole" },
        supervisedByRole: { type: String },

        // Odometer
        odometerAtEntry: { type: Number },
        odometerAtRelease: { type: Number },

        // Cost Estimates vs Actuals
        estimatedLabourHours: { type: Number, default: 0 },
        actualLabourHours: { type: Number, default: 0 },
        estimatedPartsCost: { type: Number, default: 0 },
        actualPartsCost: { type: Number, default: 0 },
        estimatedTotalCost: { type: Number, default: 0 },
        actualTotalCost: { type: Number, default: 0 },

        // Cost Approval
        costApproval: {
            approvedBy: { type: mongoose.Schema.Types.ObjectId, refPath: "costApproval.approvedByRole" },
            approvedByRole: { type: String },
            approvedAt: { type: Date },
            thresholdLevel: { type: String, enum: ["AUTO", "BRANCH", "COUNTRY", "ADMIN"] },
            rejectionReason: { type: String },
        },

        // Embedded collections
        tasks: [workOrderTaskSchema],
        parts: [workOrderPartSchema],
        labourLog: [labourEntrySchema],
        qcChecklist: [qcItemSchema],
        photos: [photoSchema],
        requiredPhotos: [requiredPhotoSchema],
        requiredParts: [requiredPartSchema],

        // Release
        releasedBy: { type: mongoose.Schema.Types.ObjectId, refPath: "releasedByRole" },
        releasedByRole: { type: String },
        releasedAt: { type: Date },
        releaseNotes: { type: String },

        // Status notes
        notes: { type: String },
        additionalWorkScope: { type: String },
        cancellationReason: { type: String },
        pauseReason: { type: String },
        rejectionReason: { type: String },

        // Linked documents
        serviceBillId: { type: mongoose.Schema.Types.ObjectId, ref: "ServiceBill" },
        insuranceClaimId: { type: mongoose.Schema.Types.ObjectId, ref: "InsuranceClaim" },

        // Audit trail
        statusHistory: [
            {
                status: { type: String, enum: WORK_ORDER_STATUSES },
                changedBy: { type: mongoose.Schema.Types.ObjectId, refPath: "statusHistory.changedByRole" },
                changedByRole: { type: String },
                timestamp: { type: Date, default: Date.now },
                notes: { type: String },
            },
        ],

        // Creator
        createdBy: { type: mongoose.Schema.Types.ObjectId, required: true, refPath: "creatorRole" },
        creatorRole: {
            type: String,
            required: true,
            enum: [
                ROLES.WORKSHOPSTAFF,
                ROLES.OPERATIONSTAFF,
                ROLES.BRANCHMANAGER,
                ROLES.COUNTRYMANAGER,
                ROLES.ADMIN,
            ],
        },

        isDeleted: { type: Boolean, default: false },
    },
    { timestamps: true }
);

// ─── Pre-save: auto-compute totalCost on parts ──────────────────────
workOrderPartSchema.pre("validate", async function () {
    this.totalCost = (this.quantity || 0) * (this.unitCost || 0);
});

// ─── Indexes ─────────────────────────────────────────────────────────
workOrderSchema.index({ status: 1 });
workOrderSchema.index({ branchId: 1 });
workOrderSchema.index({ vehicleId: 1 });
workOrderSchema.index({ priority: 1, slaDeadline: 1 });
workOrderSchema.index({ assignedTechnician: 1 });

module.exports = {
    WorkOrder: mongoose.model("WorkOrder", workOrderSchema),
    WORK_ORDER_STATUSES,
    WORK_ORDER_TYPES,
    PRIORITIES,
    TASK_STATUSES,
    PART_STATUSES,
    LABOUR_ACTIONS,
    QC_RESULTS,
};
