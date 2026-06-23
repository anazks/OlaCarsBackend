require('dotenv').config();
const mongoose = require('mongoose');

async function inspect() {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected to MongoDB.");

    const db = mongoose.connection.db;
    const invoicesCol = db.collection('invoices');

    const inv = await invoicesCol.findOne({ invoiceNumber: 'INV2026OW0618' });
    if (!inv) {
        console.log("Invoice not found.");
        await mongoose.disconnect();
        return;
    }

    console.log(`Found invoice:`, inv);

    const count = await invoicesCol.countDocuments({
        customer: inv.customer,
        invoiceType: 'RENTAL',
        isDeleted: false
    });
    console.log(`Total active RENTAL invoices for customer ${inv.customer}: ${count}`);

    const sampleInvs = await invoicesCol.find({
        customer: inv.customer,
        invoiceType: 'RENTAL',
        isDeleted: false
    }).sort({ dueDate: 1 }).limit(10).toArray();

    console.log("First 10 invoices for this customer:");
    for (const s of sampleInvs) {
        console.log(`- ${s.invoiceNumber}: dueDate=${s.dueDate ? s.dueDate.toISOString().split('T')[0] : 'null'}, weekNumber=${s.weekNumber}`);
    }

    const lastInvs = await invoicesCol.find({
        customer: inv.customer,
        invoiceType: 'RENTAL',
        isDeleted: false
    }).sort({ dueDate: -1 }).limit(10).toArray();

    console.log("\nLast 10 invoices for this customer:");
    for (const s of lastInvs) {
        console.log(`- ${s.invoiceNumber}: dueDate=${s.dueDate ? s.dueDate.toISOString().split('T')[0] : 'null'}, weekNumber=${s.weekNumber}`);
    }

    await mongoose.disconnect();
}

inspect();
