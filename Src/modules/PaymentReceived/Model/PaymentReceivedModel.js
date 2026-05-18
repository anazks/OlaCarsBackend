const mongoose = require('mongoose');

const paymentReceivedSchema = new mongoose.Schema({
    paymentNumber: { 
        type: String, 
        required: true, 
        unique: true 
    },
    driverId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Driver', 
        required: true 
    },
    amountReceived: { 
        type: Number, 
        required: true 
    },
    paymentDate: { 
        type: Date, 
        default: Date.now 
    },
    paymentMethod: { 
        type: String, 
        enum: ["Cash", "Bank Transfer", "Card", "Mobile Money", "Other"], 
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
    invoices: [{
        invoiceId: { 
            type: mongoose.Schema.Types.ObjectId, 
            ref: 'Invoice' 
        },
        invoiceNumber: { 
            type: String 
        },
        amountApplied: { 
            type: Number 
        }
    }],
    status: { 
        type: String, 
        enum: ["COMPLETED", "VOID"], 
        default: 'COMPLETED' 
    },
    depositedTo: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'AccountingCode',
        required: false
    },
    branch: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Branch',
        required: false
    }
}, { timestamps: true });

module.exports = mongoose.model('PaymentReceived', paymentReceivedSchema);
