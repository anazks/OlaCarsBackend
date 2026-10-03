const mongoose = require('mongoose');

const paymentMadeSchema = new mongoose.Schema({
    paymentNumber: {
        type: String,
        required: true
    },
    supplier: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Supplier',
        required: true
    },
    amount: {
        type: Number,
        required: true
    },
    paymentDate: {
        type: Date,
        default: Date.now
    },
    paymentMethod: {
        type: String,
        enum: ["Cash", "Bank Transfer", "Card", "Cheque", "Other"],
        default: "Cash"
    },
    referenceNumber: {
        type: String,
        required: false
    },
    notes: {
        type: String,
        required: false
    },
    bills: [{
        billId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Bill'
        },
        billNumber: {
            type: String
        },
        amountApplied: {
            type: Number
        }
    }],
    paidThroughAccount: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'AccountingCode',
        required: false
    },
    branch: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Branch',
        required: false
    },
    attachments: [{
        url: { type: String, trim: true },
        name: { type: String, trim: true },
        originalName: { type: String, trim: true },
        fileType: { type: String, trim: true },
        size: { type: Number },
        uploadedAt: { type: Date, default: Date.now }
    }],
    status: {
        type: String,
        enum: ["COMPLETED", "VOID"],
        default: 'COMPLETED'
    }
}, { timestamps: true });

module.exports = mongoose.model('PaymentMade', paymentMadeSchema);
