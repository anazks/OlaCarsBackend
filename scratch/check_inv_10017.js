const mongoose = require('mongoose');
require('dotenv').config();

require('../Src/modules/AccountingCode/Model/AccountingCodeModel');
require('../Src/modules/Driver/Model/DriverModel');
const { Invoice } = require('../Src/modules/Invoice/Model/InvoiceModel');
const LedgerEntry = require('../Src/modules/Ledger/Model/LedgerEntryModel');
const BankTransaction = require('../Src/modules/BankAccount/Model/BankTransactionModel');

async function run() {
    await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);
    console.log("Connected successfully.");

    const invoice = await Invoice.findOne({ invoiceNumber: "INV-10017" });
    console.log("\n--- Invoice INV-10017 ---");
    console.log(JSON.stringify(invoice, null, 2));

    const ledgerEntries = await LedgerEntry.find({
        description: /INV-10017/i
    }).populate('accountingCode');

    console.log(`\n--- Ledger Entries matching INV-10017 (${ledgerEntries.length} found) ---`);
    ledgerEntries.forEach(e => {
        console.log(JSON.stringify(e, null, 2));
    });

    await mongoose.disconnect();
}

run().catch(err => console.error(err));
