const mongoose = require('mongoose');
require('dotenv').config();

const BankAccount = require('../Src/modules/BankAccount/Model/BankAccountModel');
const LedgerEntry = require('../Src/modules/Ledger/Model/LedgerEntryModel');
const BankTransaction = require('../Src/modules/BankAccount/Model/BankTransactionModel');

async function verify() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        const accountId = '6a280e00abfae20029fc99a7';
        const account = await BankAccount.findById(accountId);

        const query = { accountingCode: account.accountingCode };
        const transactions = await LedgerEntry.find(query)
            .sort({ entryDate: -1, _id: -1 })
            .limit(5);

        console.log('Top 5 transactions returned for ledger page (descending order):');
        transactions.forEach((tx, idx) => {
            console.log(`#${idx + 1}: ID=${tx._id}, Date=${tx.entryDate.toISOString()}, Type=${tx.type}, Amount=${tx.amount}, LedgerRunningBalance=${tx.runningBalance}, Desc=${tx.description.substring(0, 45)}...`);
        });

    } catch (err) {
        console.error(err);
    } finally {
        await mongoose.disconnect();
        process.exit(0);
    }
}

verify();
