/**
 * Cleanup Script: Delete all transactions for BI BANK (account 6a280e01abfae20029fc99cc)
 * Run: node scratch/delete_bi_bank_transactions.js
 */
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const BANK_ACCOUNT_ID = '6a280e01abfae20029fc99cc';

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI || process.env.DATABASE_URL || process.env.DB_URL;

if (!MONGO_URI) {
    console.error('ERROR: No MongoDB URI found in .env file.');
    console.error('Checked: MONGO_URI, MONGODB_URI, DATABASE_URL, DB_URL');
    process.exit(1);
}

console.log('Connecting to MongoDB...');

mongoose.connect(MONGO_URI).then(async () => {
    console.log('Connected successfully.\n');

    const BankAccount = mongoose.model('BankAccount', new mongoose.Schema({
        bankName: String,
        accountNumber: String,
        accountingCode: mongoose.Schema.Types.ObjectId,
        currentBalance: Number,
        initialBalance: Number,
    }, { strict: false }), 'bankaccounts');

    const LedgerEntry = mongoose.model('LedgerEntry', new mongoose.Schema({}, { strict: false }), 'ledgerentries');
    const ManualJournal = mongoose.model('ManualJournal', new mongoose.Schema({}, { strict: false }), 'manualjournals');

    // 1) Find the account
    const account = await BankAccount.findById(BANK_ACCOUNT_ID);
    if (!account) {
        console.error('ERROR: Bank account not found with ID:', BANK_ACCOUNT_ID);
        process.exit(1);
    }

    console.log(`Account: ${account.bankName} | ${account.accountNumber}`);
    console.log(`AccountingCode: ${account.accountingCode}`);
    console.log(`CurrentBalance: ${account.currentBalance} | InitialBalance: ${account.initialBalance}\n`);

    if (!account.accountingCode) {
        console.error('ERROR: Account has no accountingCode linked. Cannot find transactions.');
        process.exit(1);
    }

    // 2) Find all ledger entries for this accounting code
    const entries = await LedgerEntry.find({ accountingCode: account.accountingCode });
    console.log(`Found ${entries.length} LedgerEntry records for this account.`);

    // 3) Collect unique ManualJournal IDs
    const journalIds = [...new Set(
        entries
            .filter(e => e.manualJournal)
            .map(e => e.manualJournal.toString())
    )];
    console.log(`Found ${journalIds.length} unique ManualJournal IDs:`, journalIds);

    if (journalIds.length === 0 && entries.length === 0) {
        console.log('\nNo transactions found. Nothing to delete.');
        process.exit(0);
    }

    // 4) Delete all ledger entries linked to these journals (including double-entry partners)
    let totalDeletedEntries = 0;
    if (journalIds.length > 0) {
        const delEntries = await LedgerEntry.deleteMany({ manualJournal: { $in: journalIds } });
        console.log(`\nDeleted ${delEntries.deletedCount} LedgerEntry records (including double-entry partners).`);
        totalDeletedEntries += delEntries.deletedCount;

        // 5) Delete ManualJournal headers
        const delJournals = await ManualJournal.deleteMany({ _id: { $in: journalIds } });
        console.log(`Deleted ${delJournals.deletedCount} ManualJournal headers.`);
    }

    // 6) Delete any orphaned entries directly on this accounting code
    const orphans = await LedgerEntry.deleteMany({
        accountingCode: account.accountingCode,
        manualJournal: { $exists: false }
    });
    if (orphans.deletedCount > 0) {
        console.log(`Deleted ${orphans.deletedCount} orphaned LedgerEntry records.`);
        totalDeletedEntries += orphans.deletedCount;
    }

    // 7) Reset balance to initial balance
    const newBalance = account.initialBalance || 0;
    await BankAccount.updateOne(
        { _id: BANK_ACCOUNT_ID },
        { $set: { currentBalance: newBalance } }
    );
    console.log(`\nBalance reset: ${account.currentBalance} → ${newBalance}`);

    console.log('\n✅ Cleanup complete!');
    console.log(`   Total entries deleted: ${totalDeletedEntries}`);
    console.log(`   Total journals deleted: ${journalIds.length}`);
    console.log(`   New balance: ${newBalance}`);

    process.exit(0);
}).catch(err => {
    console.error('MongoDB connection error:', err.message);
    process.exit(1);
});
