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
    
    const codeId = account.accountingCode;
    console.log(`Target Bank Account: ${account.accountName || account.bankName} (ID: ${account._id})`);
    console.log(`Target Accounting Code ID: ${codeId}`);
    console.log(`Current Account Balance: ${account.currency} ${account.currentBalance}`);
    
    // Find LedgerEntries linked to this accounting code that came from import statement
    const ledgerEntries = await LedgerEntry.find({
        accountingCode: codeId,
        description: /Bank Statement Transaction|Bank transaction/i
    }).sort({ createdAt: -1 });

    console.log(`Found ${ledgerEntries.length} candidate ledger entries to remove.`);
    
    if (ledgerEntries.length === 0) {
        console.log("No test imported transactions found.");
        process.exit(0);
    }

    // We only want to delete the 3 recently imported ones (or all matching)
    // Let's print them first
    let balanceAdjustment = 0;
    const journalIdsToDelete = new Set();
    const ledgerEntryIdsToDelete = [];

    for (const entry of ledgerEntries) {
        console.log(`- Removing Entry: ID=${entry._id}, Journal=${entry.manualJournal}, Type=${entry.type}, Amount=${entry.amount}, Desc="${entry.description}"`);
        ledgerEntryIdsToDelete.push(entry._id);
        if (entry.manualJournal) {
            journalIdsToDelete.add(entry.manualJournal.toString());
        }
        
        // Reverse balance change:
        // A DEBIT originally increased the balance, so we subtract it.
        // A CREDIT originally decreased the balance, so we add it.
        let balanceChange = 0;
        if (account.accountType === "Credit Card") {
            balanceChange = entry.type === "DEBIT" ? -entry.amount : entry.amount;
        } else {
            balanceChange = entry.type === "DEBIT" ? entry.amount : -entry.amount;
        }
        balanceAdjustment -= balanceChange;
    }

    console.log(`Calculated balance adjustment to apply: ${balanceAdjustment}`);

    // Perform Deletion
    const deletedLedgerCount = await LedgerEntry.deleteMany({ _id: { $in: ledgerEntryIdsToDelete } });
    console.log(`Deleted ${deletedLedgerCount.deletedCount} LedgerEntry documents.`);

    if (journalIdsToDelete.size > 0) {
        const deletedJournalCount = await ManualJournal.deleteMany({ _id: { $in: Array.from(journalIdsToDelete) } });
        console.log(`Deleted ${deletedJournalCount.deletedCount} ManualJournal documents.`);
    }

    // Adjust Bank Account balance
    account.currentBalance = Number(account.currentBalance || 0) + balanceAdjustment;
    await account.save();
    console.log(`Updated Bank Account Balance to: ${account.currency} ${account.currentBalance}`);

    process.exit(0);
}
run();
