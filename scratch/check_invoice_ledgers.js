const mongoose = require('mongoose');
require('dotenv').config();

require('../Src/modules/AccountingCode/Model/AccountingCodeModel');
const LedgerEntry = require('../Src/modules/Ledger/Model/LedgerEntryModel');
const { Invoice } = require('../Src/modules/Invoice/Model/InvoiceModel');

async function run() {
    await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);
    console.log("Connected to database.");

    const invoiceNumber = process.argv[2];
    if (!invoiceNumber) {
        console.error("Please provide an invoice number, e.g. node check_invoice_ledgers.js INV-10016");
        await mongoose.disconnect();
        return;
    }

    const invoice = await Invoice.findOne({ invoiceNumber: invoiceNumber });
    if (!invoice) {
        console.error(`Invoice ${invoiceNumber} not found.`);
        await mongoose.disconnect();
        return;
    }

    console.log(`\n=== Invoice Details ===`);
    console.log(`Number: ${invoice.invoiceNumber}`);
    console.log(`ID: ${invoice._id}`);
    console.log(`Status: ${invoice.status}`);
    console.log(`Amount Paid: ${invoice.amountPaid}`);
    console.log(`Total Due: ${invoice.totalAmountDue}`);
    console.log(`Payments:`, invoice.payments);

    // Queries like frontend
    console.log(`\n=== Frontend Queries ===`);
    const q1 = { description: { $regex: new RegExp(invoiceNumber, 'i') } };
    const q2 = { transactionId: String(invoice._id) };
    const q3 = { transactionId: invoiceNumber };

    const entries1 = await LedgerEntry.find(q1).populate('accountingCode');
    const entries2 = await LedgerEntry.find(q2).populate('accountingCode');
    const entries3 = await LedgerEntry.find(q3).populate('accountingCode');

    const uniqueMap = new Map();
    [...entries1, ...entries2, ...entries3].forEach(e => {
        uniqueMap.set(e._id.toString(), e);
    });

    console.log(`Found ${uniqueMap.size} unique ledger entries:`);
    uniqueMap.forEach(e => {
        console.log(`- ID: ${e._id}`);
        console.log(`  Code: ${e.accountingCode?.code} (${e.accountingCode?.name})`);
        console.log(`  Type: ${e.type}`);
        console.log(`  Amount: ${e.amount}`);
        console.log(`  Desc: "${e.description}"`);
        console.log(`  TxId: ${e.transactionId}`);
        console.log(`  Transaction: ${e.transaction}`);
        console.log(`  manualJournal: ${e.manualJournal}`);
    });

    await mongoose.disconnect();
}

run().catch(err => console.error(err));
