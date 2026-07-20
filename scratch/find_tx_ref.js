const mongoose = require('mongoose');
require('dotenv').config();

// Register AccountingCode model
require('../Src/modules/AccountingCode/Model/AccountingCodeModel');

async function run() {
    console.log("Connecting to MongoDB...");
    await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);
    console.log("Connected successfully.");

    const LedgerEntry = require('../Src/modules/Ledger/Model/LedgerEntryModel');
    const BankTransaction = require('../Src/modules/BankAccount/Model/BankTransactionModel');

    const ledgerMatches = await LedgerEntry.find({ transactionId: "20260000001" }).populate('accountingCode');
    console.log(`\nLedger Entries with transactionId "20260000001" (${ledgerMatches.length} found):`);
    ledgerMatches.forEach(e => {
        console.log(`- ID: ${e._id}, Code: ${e.accountingCode?.code}, Desc: "${e.description}", Contact: ${e.contact}`);
    });

    const bankMatches = await BankTransaction.find({ transactionId: "20260000001" }).populate('accountingCode');
    console.log(`\nBank Transactions with transactionId "20260000001" (${bankMatches.length} found):`);
    bankMatches.forEach(t => {
        console.log(`- ID: ${t._id}, Code: ${t.accountingCode?.code}, Desc: "${t.description}", Customer: ${t.customer}, Invoice: ${t.invoice}`);
    });

    await mongoose.disconnect();
}

run().catch(err => console.error(err));
