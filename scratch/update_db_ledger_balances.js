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

        // Find the Banco General AH 1601 bank account
        const account = await BankAccount.findOne({
            $or: [
                { accountName: /Banco General AH 1601/i },
                { bankName: /Banco General AH 1601/i },
                { accountName: /1601/ },
                { accountNumber: /1601/ }
            ]
        });

        if (!account) {
            console.error("BankAccount 'Banco General AH 1601' not found!");
            process.exit(1);
        }

        console.log(`Found Account: "${account.accountName || account.bankName}" (${account._id})`);
        console.log(`Initial Balance: ${account.initialBalance}`);
        console.log(`Current Balance stored in BankAccount: ${account.currentBalance}`);

        // --- PART 1: Update LedgerEntry Collections ---
        console.log("\nFetching LedgerEntry documents...");
        const ledgerEntries = await LedgerEntry.find({ accountingCode: account.accountingCode }).sort({ entryDate: 1, _id: 1 });
        console.log(`Found ${ledgerEntries.length} ledger entries.`);

        let balanceAccumLedger = account.initialBalance || 0;
        const ledgerBulkOps = [];

        for (const entry of ledgerEntries) {
            const isCreditCard = account.accountType === 'Credit Card';
            if (entry.type === 'DEBIT') {
                balanceAccumLedger = isCreditCard ? (balanceAccumLedger - entry.amount) : (balanceAccumLedger + entry.amount);
            } else if (entry.type === 'CREDIT') {
                balanceAccumLedger = isCreditCard ? (balanceAccumLedger + entry.amount) : (balanceAccumLedger - entry.amount);
            }

            ledgerBulkOps.push({
                updateOne: {
                    filter: { _id: entry._id },
                    update: { $set: { runningBalance: balanceAccumLedger } }
                }
            });
        }

        if (ledgerBulkOps.length > 0) {
            console.log(`Executing bulkWrite for ${ledgerBulkOps.length} LedgerEntry documents...`);
            const ledgerResult = await LedgerEntry.bulkWrite(ledgerBulkOps);
            console.log(`LedgerEntry bulkWrite result: Matched: ${ledgerResult.matchedCount}, Modified: ${ledgerResult.modifiedCount}`);
        } else {
            console.log("No LedgerEntry documents to update.");
        }


        // --- PART 2: Update BankTransaction Collections ---
        console.log("\nFetching BankTransaction documents...");
        const bankTxs = await BankTransaction.find({ bankAccount: account._id }).sort({ entryDate: 1, _id: 1 });
        console.log(`Found ${bankTxs.length} bank transactions.`);

        let balanceAccumTx = account.initialBalance || 0;
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
            console.log(`Executing bulkWrite for ${txBulkOps.length} BankTransaction documents...`);
            const txResult = await BankTransaction.bulkWrite(txBulkOps);
            console.log(`BankTransaction bulkWrite result: Matched: ${txResult.matchedCount}, Modified: ${txResult.modifiedCount}`);
        } else {
            console.log("No BankTransaction documents to update.");
        }


        // --- PART 3: Update BankAccount currentBalance ---
        console.log(`\nFinal calculated balance from Ledger: ${balanceAccumLedger}`);
        console.log(`Final calculated balance from Transactions: ${balanceAccumTx}`);

        // Update the currentBalance in BankAccount model to match the final calculated balance
        const finalBalance = balanceAccumLedger;
        account.currentBalance = finalBalance;
        await account.save();
        console.log(`Successfully updated BankAccount currentBalance to: ${finalBalance}`);

        process.exit(0);
    } catch (err) {
        console.error("Execution failed:", err);
        process.exit(1);
    }
}

run();
