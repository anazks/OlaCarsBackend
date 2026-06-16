require('dotenv').config();
const mongoose = require('mongoose');
const { Invoice } = require('../Src/modules/Invoice/Model/InvoiceModel');

async function inspect() {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected to MongoDB\n");

    const totalCount = await Invoice.countDocuments({ isDeleted: false });
    console.log(`Total active invoices: ${totalCount}`);

    if (totalCount === 0) {
        console.log("No active invoices in DB.");
        await mongoose.disconnect();
        return;
    }

    // Get date ranges for generatedAt and dueDate
    const minGenerated = await Invoice.findOne({ isDeleted: false, generatedAt: { $ne: null } }).sort({ generatedAt: 1 }).select('generatedAt');
    const maxGenerated = await Invoice.findOne({ isDeleted: false, generatedAt: { $ne: null } }).sort({ generatedAt: -1 }).select('generatedAt');

    const minDue = await Invoice.findOne({ isDeleted: false, dueDate: { $ne: null } }).sort({ dueDate: 1 }).select('dueDate');
    const maxDue = await Invoice.findOne({ isDeleted: false, dueDate: { $ne: null } }).sort({ dueDate: -1 }).select('dueDate');

    console.log(`generatedAt range: ${minGenerated?.generatedAt?.toISOString() || 'N/A'} to ${maxGenerated?.generatedAt?.toISOString() || 'N/A'}`);
    console.log(`dueDate range: ${minDue?.dueDate?.toISOString() || 'N/A'} to ${maxDue?.dueDate?.toISOString() || 'N/A'}`);

    // Count invoices in the last 30 days of generatedAt
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const countLast30 = await Invoice.countDocuments({ isDeleted: false, generatedAt: { $gte: thirtyDaysAgo } });
    console.log(`Invoices generated in last 30 days: ${countLast30}`);

    // Print details of the first 5 invoices
    const sample = await Invoice.find({ isDeleted: false }).limit(5).select('invoiceNumber generatedAt dueDate totalAmountDue amountPaid balance status');
    console.log("\nSample Invoices:");
    sample.forEach(s => {
        console.log(`  INV: ${s.invoiceNumber}, gen: ${s.generatedAt?.toISOString() || 'NULL'}, due: ${s.dueDate?.toISOString() || 'NULL'}, totalAmountDue: ${s.totalAmountDue}, amountPaid: ${s.amountPaid}, balance: ${s.balance}, status: ${s.status}`);
    });

    await mongoose.disconnect();
}
inspect().catch(e => { console.error(e); process.exit(1); });
