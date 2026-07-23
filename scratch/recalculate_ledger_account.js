const mongoose = require('mongoose');
require('dotenv').config();

const BankAccount = require('../Src/modules/BankAccount/Model/BankAccountModel');
const BankTransaction = require('../Src/modules/BankAccount/Model/BankTransactionModel');
const LedgerEntry = require('../Src/modules/Ledger/Model/LedgerEntryModel');
const { recalculateRunningBalances, getBankAccountById } = require('../Src/modules/BankAccount/Service/BankAccountService');

async function run() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB');

        const targetId = '6a280e00abfae20029fc99a7';

        // Find the bank account by ID or account code or matching _id substring
        let account = await BankAccount.findById(targetId);
        if (!account) {
            account = await BankAccount.findOne({
                $or: [
                    { _id: targetId },
                    { accountCode: targetId },
                    { accountingCode: targetId }
                ]
            });
        }

        if (!account) {
            // Find by regex substring if not exact match
            const allAccounts = await BankAccount.find({ isDeleted: false });
            account = allAccounts.find(a => a._id.toString().includes('6a280e00') || (a.accountCode && a.accountCode.includes('6a280e00')));
        }

        if (!account) {
            console.error(`Bank Account not found for ID/code ${targetId}`);
            const all = await BankAccount.find({ isDeleted: false });
            console.log('Available Bank Accounts:');
            all.forEach(a => console.log(`- ID: ${a._id}, Code: ${a.accountCode}, Name: ${a.accountName || a.bankName}, Balance: ${a.currentBalance}`));
            return;
        }

        console.log(`Found Bank Account: ${account.accountName || account.bankName} (ID: ${account._id}, Code: ${account.accountCode}, AccountingCode: ${account.accountingCode})`);

        // Recalculate running balances for this bank account
        const finalBalance = await recalculateRunningBalances(account._id);
        console.log(`recalculateRunningBalances completed. Updated currentBalance = ${finalBalance}`);

        // Fetch updated account using getBankAccountById
        const updatedAccount = await getBankAccountById(account._id);
        console.log(`Fetched BankAccount currentBalance: ${updatedAccount.currentBalance}`);

        // Get last LedgerEntry transaction for this account's accountingCode
        if (account.accountingCode) {
            const lastEntry = await LedgerEntry.findOne({ accountingCode: account.accountingCode })
                .sort({ entryDate: -1, createdAt: -1, _id: -1 });

            if (lastEntry) {
                console.log(`Last LedgerEntry: ID=${lastEntry._id}, Date=${lastEntry.entryDate}, Type=${lastEntry.type}, Amount=${lastEntry.amount}, RunningBalance=${lastEntry.runningBalance}`);
            } else {
                console.log('No LedgerEntry records found for this accountingCode.');
            }
        }

    } catch (err) {
        console.error('Error during recalculation:', err);
    } finally {
        await mongoose.disconnect();
        process.exit(0);
    }
}

run();
