const mongoose = require("mongoose");

const BILL_STATUSES = ["DRAFT", "PENDING_APPROVAL", "APPROVED", "PAID", "VOID"];

const PAYMENT_METHODS = ["Cash", "Bank Transfer", "Credit Card", "Insurance", "Internal"];

const lineItemSchema = new mongoose.Schema({
    type: { type: String, enum: ["LABOUR", "PART", "MISC"], required: true },
    description: { type: String, required: true },
    quantity: { type: Number, required: true, min: 0 },
    unitPrice: { type: Number, required: true, min: 0 },
    lineTotal: { type: Number, default: 0 },
    partId: { type: mongoose.Schema.Types.ObjectId, ref: "InventoryPart" },
});

lineItemSchema.pre("validate", async function () {
    this.lineTotal = (this.quantity || 0) * (this.unitPrice || 0);
});

const accountingEntrySchema = new mongoose.Schema({
    entryType: { type: String, enum: ["DEBIT", "CREDIT"], required: true },
    accountCode: { type: String, required: true },
    accountName: { type: String },
    amount: { type: Number, required: true },
    description: { type: String },
    createdAt: { type: Date, default: Date.now },
});

const serviceBillSchema = new mongoose.Schema(
    {
        billNumber: { type: String, unique: true, required: true },

        // References
        workOrderId: { type: mongoose.Schema.Types.ObjectId, ref: "WorkOrder", required: true },
        vehicleId: { type: mongoose.Schema.Types.ObjectId, ref: "Vehicle", required: true },
        branchId: { type: mongoose.Schema.Types.ObjectId, ref: "Branch", required: true },

        // Status
        status: { type: String, enum: BILL_STATUSES, default: "DRAFT" },

        // Line items
        lineItems: [lineItemSchema],

        // Totals
        subtotal: { type: Number, default: 0 },
        taxRate: { type: Number, default: 0 },
        taxAmount: { type: Number, default: 0 },
        discount: { type: Number, default: 0 },
        totalAmount: { type: Number, default: 0 },

        // Labour summary
        labourSummary: {
            totalHours: { type: Number, default: 0 },
            hourlyRate: { type: Number, default: 50 },
            labourTotal: { type: Number, default: 0 },
        },

        // Payment
        paymentStatus: { type: String, enum: ["UNPAID", "PARTIAL", "PAID"], default: "UNPAID" },
        paymentMethod: { type: String, enum: PAYMENT_METHODS },
        paymentReference: { type: String },
        paidAt: { type: Date },

        // Accounting
        accountingEntries: [accountingEntrySchema],

        // Approval
        approvedBy: { type: mongoose.Schema.Types.ObjectId, refPath: "approvedByRole" },
        approvedByRole: { type: String },
        approvedAt: { type: Date },

        // Notes
        notes: { type: String },
        voidReason: { type: String },

        // Audit
        createdBy: { type: mongoose.Schema.Types.ObjectId, required: true, refPath: "creatorRole" },
        creatorRole: { type: String, required: true },
    },
    { timestamps: true }
);

// Indexes
serviceBillSchema.index({ billNumber: 1 });
serviceBillSchema.index({ workOrderId: 1 });
serviceBillSchema.index({ branchId: 1 });
serviceBillSchema.index({ status: 1 });

module.exports = {
    ServiceBill: mongoose.model("ServiceBill", serviceBillSchema),
    BILL_STATUSES,
    PAYMENT_METHODS,
};
