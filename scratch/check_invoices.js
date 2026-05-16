const mongoose = require('mongoose');
require('dotenv').config();
const { Invoice } = require('../Src/modules/Invoice/Model/InvoiceModel');

async function checkInvoices() {
    try {
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/ola-cars');
        const count = await Invoice.countDocuments();
        const types = await Invoice.aggregate([
            { $group: { _id: '$invoiceType', count: { $sum: 1 } } }
        ]);
        console.log('Total Invoices:', count);
        console.log('Types:', JSON.stringify(types, null, 2));
        
        const sample = await Invoice.find().limit(5).lean();
        console.log('Sample:', JSON.stringify(sample, null, 2));
        
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkInvoices();
