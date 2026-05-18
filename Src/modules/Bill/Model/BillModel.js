const mongoose = require("mongoose");

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
            required: true,
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
        notes: {
            type: String,
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
    { timestamps: true }
);

// Middleware to update balanceDue before saving
billSchema.pre("save", async function () {
    this.balanceDue = this.totalAmount - this.amountPaid;
    if (this.balanceDue <= 0 && this.totalAmount > 0) {
        this.status = "PAID";
    } else if (this.amountPaid > 0 && this.balanceDue > 0) {
        this.status = "PARTIALLY_PAID";
    }
});

module.exports = mongoose.model("Bill", billSchema);
