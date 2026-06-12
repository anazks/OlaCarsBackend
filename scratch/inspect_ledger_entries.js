const mongoose = require('mongoose');
require('dotenv').config();
const AccountingCode = require('../Src/modules/AccountingCode/Model/AccountingCodeModel');
const BankAccount = require('../Src/modules/BankAccount/Model/BankAccountModel');
const LedgerEntry = require('../Src/modules/Ledger/Model/LedgerEntryModel');
const ManualJournal = require('../Src/modules/Ledger/Model/ManualJournalModel');

async function run() {
    await mongoose.connect(process.env.MONGO_URI);
    
    // Find the BI BANK account
    const account = await BankAccount.findOne({ accountNumber: /100030008383/ });
    if (!account) {
        console.log("BI BANK account not found!");
        process.exit(1);
    }
    
    console.log(`Found account: ${account.accountName || account.bankName} (${account.accountNumber})`);
    console.log(`Current Balance: ${account.currency} ${account.currentBalance}`);
    
    const entries = await LedgerEntry.find({ accountingCode: account.accountingCode }).sort({ createdAt: -1 });
    console.log(`Found ${entries.length} ledger entries:`);
    console.log(JSON.stringify(entries.map(e => ({
        id: e._id,
        manualJournal: e.manualJournal,
        type: e.type,
        amount: e.amount,
        description: e.description,
        entryDate: e.entryDate,
        createdAt: e.createdAt
    })), null, 2));
    
    process.exit(0);
}
run();
