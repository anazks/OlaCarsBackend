const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const AccountingCode = require('../Src/modules/AccountingCode/Model/AccountingCodeModel');
const BankAccount = require('../Src/modules/BankAccount/Model/BankAccountModel');
const LedgerEntry = require('../Src/modules/Ledger/Model/LedgerEntryModel');
const BankTransaction = require('../Src/modules/BankAccount/Model/BankTransactionModel');

async function run() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Connected to MongoDB");

        // Find all active bank accounts
        const accounts = await BankAccount.find({ isDeleted: false });
        console.log(`Found ${accounts.length} active bank accounts.`);

        for (const account of accounts) {
            console.log(`\n==================================================`);
            console.log(`Processing Account: "${account.accountName || account.bankName}" (${account._id})`);
            console.log(`Account Code: ${account.accountCode}, Type: ${account.accountType}`);
            console.log(`Old Initial Balance: ${account.initialBalance}, Old Current Balance: ${account.currentBalance}`);

            // Set initialBalance to 0
            account.initialBalance = 0;

            const accCodeId = account.accountingCode;
            if (!accCodeId) {
                console.log(`Warning: Account "${account.accountName}" has no linked accounting code. Setting currentBalance to 0.`);
                account.currentBalance = 0;
                await account.save();
                continue;
            }

            const accountingCodeDoc = await AccountingCode.findOne({ _id: accCodeId });
            if (!accountingCodeDoc) {
                console.log(`Warning: Linked accounting code (${accCodeId}) not found. Setting currentBalance to 0.`);
                account.currentBalance = 0;
                await account.save();
                continue;
            }

            // --- PART 1: Update LedgerEntries ---
            const ledgerEntries = await LedgerEntry.find({ accountingCode: accCodeId }).sort({ entryDate: 1, _id: 1 });
            console.log(`Found ${ledgerEntries.length} LedgerEntry documents.`);

            let balanceAccumLedger = 0;
            let debitTotalLedger = 0;
            let creditTotalLedger = 0;
            const ledgerBulkOps = [];

            for (const entry of ledgerEntries) {
                const isCreditCard = account.accountType === 'Credit Card';
                if (entry.type === 'DEBIT') {
                    balanceAccumLedger = isCreditCard ? (balanceAccumLedger - entry.amount) : (balanceAccumLedger + entry.amount);
                    debitTotalLedger += entry.amount;
                } else if (entry.type === 'CREDIT') {
                    balanceAccumLedger = isCreditCard ? (balanceAccumLedger + entry.amount) : (balanceAccumLedger - entry.amount);
                    creditTotalLedger += entry.amount;
                }

                ledgerBulkOps.push({
                    updateOne: {
                        filter: { _id: entry._id },
                        update: { $set: { runningBalance: balanceAccumLedger } }
                    }
                });
            }

            if (ledgerBulkOps.length > 0) {
                console.log(`Updating ${ledgerBulkOps.length} LedgerEntry documents...`);
                await LedgerEntry.bulkWrite(ledgerBulkOps);
            }

            // --- PART 2: Update BankTransactions ---
            const bankTxs = await BankTransaction.find({ bankAccount: account._id }).sort({ entryDate: 1, _id: 1 });
            console.log(`Found ${bankTxs.length} BankTransaction documents.`);

            let balanceAccumTx = 0;
            const txBulkOps = [];

            for (const tx of bankTxs) {
                const isCreditCard = account.accountType === 'Credit Card';
                if (tx.type === 'DEBIT') {
                    balanceAccumTx = isCreditCard ? (balanceAccumTx - tx.amount) : (balanceAccumTx + tx.amount);
                } else if (tx.type === 'CREDIT') {
                    balanceAccumTx = isCreditCard ? (balanceAccumTx + tx.amount) : (balanceAccumTx - tx.amount);
                }

                txBulkOps.push({
                    updateOne: {
                        filter: { _id: tx._id },
                        update: { $set: { runningBalance: balanceAccumTx } }
                    }
                });
            }

            if (txBulkOps.length > 0) {
                console.log(`Updating ${txBulkOps.length} BankTransaction documents...`);
                await BankTransaction.bulkWrite(txBulkOps);
            }

            // --- PART 3: Sync BankAccount and AccountingCode ---
            console.log(`New Opening Balance set to: 0.00`);
            console.log(`New Current Balance from Ledger: ${balanceAccumLedger}`);
            console.log(`New Current Balance from Transactions: ${balanceAccumTx}`);

            account.currentBalance = balanceAccumLedger;
            await account.save();

            accountingCodeDoc.debitTotal = debitTotalLedger;
            accountingCodeDoc.creditTotal = creditTotalLedger;
            accountingCodeDoc.currentBalance = balanceAccumLedger;
            await accountingCodeDoc.save();

            console.log(`Successfully updated and synced "${account.accountName || account.bankName}".`);
        }

        console.log(`\nAll bank accounts updated successfully.`);
        process.exit(0);
    } catch (err) {
        console.error("Execution failed:", err);
        process.exit(1);
    }
}

run();
