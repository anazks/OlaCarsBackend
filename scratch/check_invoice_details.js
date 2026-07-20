const mongoose = require('mongoose');
require('dotenv').config();

// Register AccountingCode model
require('../Src/modules/AccountingCode/Model/AccountingCodeModel');

async function run() {
    console.log("Connecting to MongoDB...");
    await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);
    console.log("Connected successfully.");

    const { Invoice } = require('../Src/modules/Invoice/Model/InvoiceModel');
    const LedgerEntry = require('../Src/modules/Ledger/Model/LedgerEntryModel');

    // 1. Fetch INV-10014 details
    const invoice = await Invoice.findOne({ invoiceNumber: "INV-10014" });
    if (!invoice) {
        console.log("Invoice INV-10014 not found.");
    } else {
        console.log(`\nInvoice: ${invoice.invoiceNumber}`);
        console.log(`Status: ${invoice.status}`);
        console.log(`AmountPaid: $${invoice.amountPaid}`);
        console.log(`Balance: $${invoice.balance}`);
        console.log(`Payments:`, JSON.stringify(invoice.payments, null, 2));
    }

    // 2. Fetch Ledger Entries matching INV-10014 in description
    const entries = await LedgerEntry.find({
        description: { $regex: /INV-10014/i }
    }).populate('accountingCode');

    console.log(`\nLedger Entries matching "INV-10014" in description (${entries.length} found):`);
    entries.forEach(e => {
        console.log(JSON.stringify(e, null, 2));
        console.log(`Contact: ${e.contact}`);
        console.log("-----------------------------------------");
    });

    await mongoose.disconnect();
}

run().catch(err => console.error(err));
