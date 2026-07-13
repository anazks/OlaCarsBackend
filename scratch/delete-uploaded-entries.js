const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const mongoUri = process.env.MONGO_URI || 'mongodb+srv://integracionolacars_db_user:Olacars2026%40@cluster0.6bdmvf.mongodb.net/olaCarsFresh?appName=Cluster0';

async function run() {
    console.log('Connecting to database...');
    await mongoose.connect(mongoUri.trim());
    console.log('Connected!');

    const BankTransaction = require('../Src/modules/BankAccount/Model/BankTransactionModel');
    const LedgerEntry = require('../Src/modules/Ledger/Model/LedgerEntryModel');
    const BankAccount = require('../Src/modules/BankAccount/Model/BankAccountModel');
    const AccountingCode = require('../Src/modules/AccountingCode/Model/AccountingCodeModel');

    // 5:00 PM today local time (GMT+5:30) is 11:30 AM UTC
    const cutoffTime = new Date('2026-07-13T11:30:00.000Z');
    console.log(` cutoff time: ${cutoffTime.toISOString()}`);

    // 1. Find all target entries to delete
    const txsToDelete = await BankTransaction.find({ createdAt: { $gte: cutoffTime } });
    console.log(`Found ${txsToDelete.length} Bank Transactions to delete.`);

    const ledgersToDelete = await LedgerEntry.find({ createdAt: { $gte: cutoffTime } });
    console.log(`Found ${ledgersToDelete.length} Ledger Entries to delete.`);

    if (txsToDelete.length === 0 && ledgersToDelete.length === 0) {
        console.log('No entries found to delete.');
        await mongoose.disconnect();
        return;
    }

    // 2. Identify unique Bank Accounts & Accounting Codes affected
    const affectedAccountIds = new Set();
    const affectedAccCodeIds = new Set();

    for (const tx of txsToDelete) {
        if (tx.bankAccount) affectedAccountIds.add(tx.bankAccount.toString());
        if (tx.accountingCode) affectedAccCodeIds.add(tx.accountingCode.toString());
    }

    for (const le of ledgersToDelete) {
        if (le.accountingCode) affectedAccCodeIds.add(le.accountingCode.toString());
    }

    // 3. Delete the entries
    const txDeleteResult = await BankTransaction.deleteMany({ createdAt: { $gte: cutoffTime } });
    console.log(`Successfully deleted ${txDeleteResult.deletedCount} Bank Transactions.`);

    const ledgerDeleteResult = await LedgerEntry.deleteMany({ createdAt: { $gte: cutoffTime } });
    console.log(`Successfully deleted ${ledgerDeleteResult.deletedCount} Ledger Entries.`);

    // 4. Recalculate balances and totals for each affected Bank Account & Accounting Code
    console.log('\nRecalculating account balances...');
    for (const accountId of affectedAccountIds) {
        const account = await BankAccount.findById(accountId);
        if (!account) continue;

        const accCodeId = account.accountingCode;
        if (!accCodeId) continue;

        // Fetch all remaining ledger entries for this account
        const remainingLedgers = await LedgerEntry.find({ accountingCode: accCodeId });
        
        let debitTotal = 0;
        let creditTotal = 0;
        for (const le of remainingLedgers) {
            if (le.type === 'DEBIT') {
                debitTotal += le.amount;
            } else if (le.type === 'CREDIT') {
                creditTotal += le.amount;
            }
        }

        const isCreditCard = account.accountType === 'Credit Card';
        const newBalance = isCreditCard
            ? (account.initialBalance || 0) - debitTotal + creditTotal
            : (account.initialBalance || 0) + debitTotal - creditTotal;

        console.log(`Account "${account.accountName || account.bankName}":`);
        console.log(`  - Old currentBalance: ${account.currentBalance}`);
        console.log(`  - New calculated balance: ${newBalance}`);
        console.log(`  - Remaining Debit Total: ${debitTotal}`);
        console.log(`  - Remaining Credit Total: ${creditTotal}`);

        // Update BankAccount
        account.currentBalance = newBalance;
        await account.save();

        // Update AccountingCode
        const accCodeDoc = await AccountingCode.findById(accCodeId);
        if (accCodeDoc) {
            accCodeDoc.debitTotal = debitTotal;
            accCodeDoc.creditTotal = creditTotal;
            accCodeDoc.currentBalance = newBalance;
            await accCodeDoc.save();
            console.log(`  - Updated Accounting Code "${accCodeDoc.code}"`);
        }
    }

    console.log('\nCleanup finished successfully.');
    await mongoose.disconnect();
}

run().catch(console.error);
