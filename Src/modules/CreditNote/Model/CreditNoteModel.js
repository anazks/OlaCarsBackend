const mongoose = require('mongoose');

const creditnoteSchema = new mongoose.Schema({
    creditNoteNumber: { 
        type: String, 
        required: true, 
        trim: true 
    },
    customerId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Customer', 
        required: true 
    },
    driverId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Driver',
        required: false 
    },
    invoiceId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Invoice', 
        required: false 
    },
    invoices: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Invoice'
    }],
    taxId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Tax',
        required: false
    },
    amount: { 
        type: Number, 
        required: true, 
        min: 0 
    },
    creditNoteDate: { 
        type: Date, 
        default: Date.now 
    },
    reason: { 
        type: String, 
        required: true,
        trim: true
    },
    status: { 
        type: String, 
        enum: ['DRAFT', 'OPEN', 'APPLIED', 'CLOSED', 'VOID'], 
        default: 'OPEN' 
    },
    notes: {
        type: String,
        trim: true
    },
    supportingDocument: {
        name: { type: String },
        url: { type: String },
        uploadedAt: { type: Date }
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        refPath: 'creatorRole'
    },
    creatorRole: {
        type: String,
        required: true
    }
}, { timestamps: true });

module.exports = mongoose.model('CreditNote', creditnoteSchema);