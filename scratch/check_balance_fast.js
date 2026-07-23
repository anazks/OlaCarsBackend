const mongoose = require('mongoose');
require('dotenv').config();

const BankAccount = require('../Src/modules/BankAccount/Model/BankAccountModel');
const LedgerEntry = require('../Src/modules/Ledger/Model/LedgerEntryModel');

async function run() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to DB');

        const accountId = '6a280e00abfae20029fc99a7';
        const account = await BankAccount.findById(accountId);
        if (!account) {
            console.log('Account not found');
            return;
        }

        console.log(`Bank Account: ${account.accountName || account.bankName}`);
        console.log(`Account Initial Balance: ${account.initialBalance}`);
        console.log(`Account Current Balance in DB: ${account.currentBalance}`);
        console.log(`Accounting Code ID: ${account.accountingCode}`);

        const codeId = account.accountingCode;
        if (codeId) {
            const count = await LedgerEntry.countDocuments({ accountingCode: codeId });
            console.log(`Total Ledger Entries count: ${count}`);

            // Fetch all entries sorted by entryDate, createdAt, _id
            const entries = await LedgerEntry.find({ accountingCode: codeId })
                .sort({ entryDate: 1, createdAt: 1, _id: 1 });

            let running = account.initialBalance || 0;
            const isCreditCard = account.accountType === 'Credit Card';
            const bulkOps = [];

            for (const entry of entries) {
                if (entry.type === 'DEBIT') {
                    running = isCreditCard ? (running - (entry.amount || 0)) : (running + (entry.amount || 0));
                } else if (entry.type === 'CREDIT') {
                    running = isCreditCard ? (running + (entry.amount || 0)) : (running - (entry.amount || 0));
                }

                if (Math.abs((entry.runningBalance || 0) - running) > 0.001) {
                    bulkOps.push({
                        updateOne: {
                            filter: { _id: entry._id },
                            update: { $set: { runningBalance: running } }
                        }
                    });
                }
            }

            console.log(`Calculated final running balance across ${entries.length} entries: ${running.toFixed(2)}`);
            console.log(`Entries requiring runningBalance update: ${bulkOps.length}`);

            if (bulkOps.length > 0) {
                const bulkRes = await LedgerEntry.bulkWrite(bulkOps);
                console.log(`Updated ${bulkRes.modifiedCount} ledger entries running balances.`);
            }

            // Update account currentBalance
            account.currentBalance = running;
            await account.save();
            console.log(`Updated BankAccount currentBalance to: ${account.currentBalance.toFixed(2)}`);

            if (entries.length > 0) {
                const lastEntry = entries[entries.length - 1];
                const freshLastEntry = await LedgerEntry.findById(lastEntry._id);
                console.log('--- Last Ledger Entry Summary ---');
                console.log(`Date: ${freshLastEntry.entryDate}`);
                console.log(`Description: ${freshLastEntry.description}`);
                console.log(`Type: ${freshLastEntry.type}`);
                console.log(`Amount: ${freshLastEntry.amount}`);
                console.log(`Running Balance: ${freshLastEntry.runningBalance.toFixed(2)}`);
            }
        }
    } catch (err) {
        console.error('Error:', err);
    } finally {
        await mongoose.disconnect();
        process.exit(0);
    }
}

run();
