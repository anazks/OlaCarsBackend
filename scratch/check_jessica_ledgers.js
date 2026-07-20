const mongoose = require('mongoose');
require('dotenv').config();

require('../Src/modules/AccountingCode/Model/AccountingCodeModel');
require('../Src/modules/Driver/Model/DriverModel');
const LedgerEntry = require('../Src/modules/Ledger/Model/LedgerEntryModel');
const BankTransaction = require('../Src/modules/BankAccount/Model/BankTransactionModel');

async function run() {
    await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);
    console.log("Connected successfully.");

    const customerId = "6a2835564c85b0bddca65d1f";

    const ledgerEntries = await LedgerEntry.find({
        $or: [
            { contact: customerId },
            { description: /JESSICA SOTO/i },
            { description: /INV-1001/i }
        ]
    }).populate('accountingCode');

    console.log(`\n--- Ledger Entries (${ledgerEntries.length} found) ---`);
    ledgerEntries.forEach(e => {
        console.log(`ID: ${e._id}, Code: ${e.accountingCode?.code} (${e.accountingCode?.name}), Type: ${e.type}, Amount: ${e.amount}, Desc: "${e.description}", TxId: ${e.transactionId}, TransactionRef: ${e.transaction}, JournalRef: ${e.manualJournal}`);
    });

    const bankTransactions = await BankTransaction.find({
        $or: [
            { customer: customerId },
            { description: /JESSICA SOTO/i }
        ]
    });

    console.log(`\n--- Bank Transactions (${bankTransactions.length} found) ---`);
    bankTransactions.forEach(t => {
        console.log(`ID: ${t._id}, Amount: ${t.amount}, Desc: "${t.description}", TxId: ${t.transactionId}, InvoiceRef: ${t.invoice}, CustomerRef: ${t.customer}`);
    });

    await mongoose.disconnect();
}

run().catch(err => console.error(err));
