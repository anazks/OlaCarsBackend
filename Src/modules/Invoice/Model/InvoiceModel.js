const mongoose = require("mongoose");
const { ROLES } = require("../../../shared/constants/roles");

const invoicePaymentSchema = new mongoose.Schema({
    amount: { type: Number, required: true },
    paidAt: { type: Date, default: Date.now },
    paymentMethod: { type: String, enum: ["Cash", "Bank Transfer", "Card", "Other"], default: "Cash" },
    transactionId: { type: String },
    note: { type: String },
}, { _id: true });

const invoiceSchema = new mongoose.Schema({
    invoiceNumber: { 
        type: String, 
        required: true, 
        unique: true 
    },
    driver: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Driver",
        required: true,
    },
    vehicle: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Vehicle",
    },
    weekNumber: { 
        type: Number, 
        required: true 
    },
    weekLabel: { 
        type: String 
    },
    dueDate: { 
        type: Date, 
        required: true 
    },
    baseAmount: { 
        type: Number, 
        required: true 
    },
    carryOverAmount: { 
        type: Number, 
        default: 0 
    },
    totalAmountDue: { 
        type: Number, 
        default: 0 
    },
    amountPaid: { 
        type: Number, 
        default: 0 
    },
    balance: { 
        type: Number, 
        default: 0 
    },
    status: { 
        type: String, 
        enum: ["PENDING", "PARTIAL", "PAID", "OVERDUE", "CANCELLED"], 
        default: "PENDING" 
    },
    paidAt: { 
        type: Date 
    },
    payments: [invoicePaymentSchema],
    generatedAt: { 
        type: Date, 
        default: Date.now 
    },
    pdfS3Key: { 
        type: String 
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        refPath: "creatorRole",
    },
    creatorRole: {
        type: String,
        enum: [
            ROLES.ADMIN, 
            ROLES.FINANCEADMIN, 
            ROLES.OPERATIONADMIN, 
            ROLES.COUNTRYMANAGER, 
            ROLES.BRANCHMANAGER, 
            ROLES.FINANCESTAFF,
            ROLES.OPERATIONSTAFF,
        ],
    },
    isDeleted: { type: Boolean, default: false },
}, { timestamps: true });

invoiceSchema.index({ driver: 1, weekNumber: 1 }, { unique: true });
invoiceSchema.index({ invoiceNumber: 1 });
invoiceSchema.index({ dueDate: 1 });
invoiceSchema.index({ status: 1 });

module.exports = {
    Invoice: mongoose.model("Invoice", invoiceSchema)
};
