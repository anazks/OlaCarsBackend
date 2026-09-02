const mongoose = require("mongoose");

const billPaymentSchema = new mongoose.Schema({
    amount: { type: Number, required: true },
    paidAt: { type: Date, default: Date.now },
    paymentMethod: { type: String, enum: ["Cash", "Bank Transfer", "Card", "Mobile Money", "Prepayment Credit", "Cheque", "Other"], default: "Cash" },
    transactionId: { type: String },
    note: { type: String },
}, { _id: true });

const billSchema = new mongoose.Schema(
    {
        billNumber: {
            type: String,
            required: true,
            unique: true,
        },
        purchaseOrder: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "PurchaseOrder",
            required: false,
        },
        supplier: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Supplier",
            required: false,
        },
        customer: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Customer",
        },
        branch: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Branch",
            required: true,
        },
        billDate: {
            type: Date,
            default: Date.now,
        },
        dueDate: {
            type: Date,
        },
        paidAt: {
            type: Date,
        },
        items: [
            { 
                itemName: { type: String, required: true },
                quantity: { type: Number, required: true },
                unitPrice: { type: Number, required: true },
                accountId: { type: mongoose.Schema.Types.ObjectId, ref: "AccountingCode", required: true },
                description: { type: String },
            },
        ],
        totalAmount: {
            type: Number,
            required: true,
        },
        amountPaid: {
            type: Number,
            default: 0,
        },
        balanceDue: {
            type: Number,
            required: true,
        },
        status: {
            type: String,
            enum: ["DRAFT", "OPEN", "PARTIALLY_PAID", "PAID", "VOID"],
            default: "OPEN",
        },
        payments: [billPaymentSchema],
        isInclusiveTax: {
            type: Boolean,
            default: false,
        },
        taxId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Tax",
            required: false,
        },
        taxPercentage: {
            type: Number,
            default: 0,
        },
        taxAmount: {
            type: Number,
            default: 0,
        },
        notes: {
            type: String,
        },
        purchaseType: {
            type: String,
            enum: ["CASH", "BANK", "CREDIT"],
            default: "CREDIT",
        },
        creditAccountId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "AccountingCode",
            default: null,
        },
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            refPath: "creatorRole",
        },
        creatorRole: {
            type: String,
            required: true,
        },
    },
    { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

// Virtual Populate for linked Ledger Entries
billSchema.virtual("ledgerEntries", {
    ref: "LedgerEntry",
    localField: "_id",
    foreignField: "bill"
});

billSchema.index({ createdAt: -1 });
billSchema.index({ status: 1 });
billSchema.index({ supplier: 1 });
billSchema.index({ branch: 1 });
billSchema.index({ billDate: -1 });

// Middleware to update balanceDue and calculate tax amount before saving
billSchema.pre("save", async function () {
    this.balanceDue = this.totalAmount - this.amountPaid;
    if (this.balanceDue <= 0 && this.totalAmount > 0) {
        this.status = "PAID";
    } else if (this.amountPaid > 0 && this.balanceDue > 0) {
        this.status = "PARTIALLY_PAID";
    }

    if (this.taxPercentage > 0) {
        if (this.isInclusiveTax) {
            this.taxAmount = Number((this.totalAmount - (this.totalAmount / (1 + (this.taxPercentage / 100)))).toFixed(4));
        } else {
            if (!this.taxAmount) {
                const subtotal = (this.items && this.items.length > 0)
                    ? this.items.reduce((s, it) => s + ((Number(it.quantity) || 0) * (Number(it.unitPrice) || 0)), 0)
                    : this.totalAmount;
                this.taxAmount = Number((subtotal * (this.taxPercentage / 100)).toFixed(4));
            }
        }
    } else {
        this.taxAmount = 0;
    }
});

module.exports = mongoose.model("Bill", billSchema);
