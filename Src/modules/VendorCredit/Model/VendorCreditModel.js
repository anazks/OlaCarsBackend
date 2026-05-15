const mongoose = require('mongoose');

const vendorcreditSchema = new mongoose.Schema({
    // Placeholder schema fields
    name: { type: String, required: false },
    referenceNumber: { type: String, required: false },
    amount: { type: Number, required: false },
    status: { type: String, default: 'DRAFT' }
}, { timestamps: true });

module.exports = mongoose.model('VendorCredit', vendorcreditSchema);
