const mongoose = require("mongoose");
require("dotenv").config();

async function run() {
    await mongoose.connect(process.env.MONGO_URI);
    
    // Find all ledger entries related to invoices
    const db = mongoose.connection.db;
    const entries = await db.collection("ledgerentries").find().toArray();
    console.log(`Total ledger entries: ${entries.length}`);

    let invoiceEntriesCount = 0;
    let paymentRecDoubleEntriesCount = 0;
    let redundantDriverIncomeEntriesCount = 0;

    for (const entry of entries) {
        const desc = entry.description || "";
        if (desc.startsWith("Invoice Created")) {
            invoiceEntriesCount++;
        } else if (desc.startsWith("Payment Received")) {
            paymentRecDoubleEntriesCount++;
        } else if (desc.includes("Payment") && desc.includes("Driver") && desc.includes("Vehicle Rental Income")) {
            redundantDriverIncomeEntriesCount++;
        }
    }

    console.log(`Invoice Created entries: ${invoiceEntriesCount}`);
    console.log(`Payment Received double entries: ${paymentRecDoubleEntriesCount}`);
    console.log(`Redundant Driver Income entries (to delete): ${redundantDriverIncomeEntriesCount}`);

    process.exit(0);
}

run().catch(err => {
    console.error(err);
    process.exit(1);
});
