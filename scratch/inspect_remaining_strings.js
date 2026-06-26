require('dotenv').config();
const mongoose = require('mongoose');

async function check() {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected to MongoDB.");

    const db = mongoose.connection.db;
    const invoicesCol = db.collection('invoices');

    const sampleInvoices = await invoicesCol.find({
        invoiceType: 'RENTAL',
        $expr: { $eq: [{ $type: '$weekNumber' }, 'string'] }
    }).limit(10).toArray();

    console.log(`Found ${sampleInvoices.length} sample string-weekNumber invoices:`);
    for (const inv of sampleInvoices) {
        console.log(`- ID: ${inv._id}, Invoice: ${inv.invoiceNumber}, Driver: ${inv.driver}, Customer: ${inv.customer}, weekNumber: "${inv.weekNumber}"`);
    }

    await mongoose.disconnect();
}

check();
