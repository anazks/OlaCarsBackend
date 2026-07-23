const mongoose = require('mongoose');
require('dotenv').config();

const LedgerEntry = require('../Src/modules/Ledger/Model/LedgerEntryModel');
const BankTransaction = require('../Src/modules/BankAccount/Model/BankTransactionModel');

async function check() {
    try {
        await mongoose.connect(process.env.MONGO_URI);

        const targetId = '6a61c0f3723443486b35c711';
        const ledgerDoc = await LedgerEntry.findById(targetId);
        console.log('--- DB Inspection for LedgerEntry 6a61c0f3723443486b35c711 ---');
        if (ledgerDoc) {
            console.log('LedgerEntry found in DB:');
            console.log(`_id: ${ledgerDoc._id}`);
            console.log(`runningBalance: ${ledgerDoc.runningBalance}`);
            console.log(`amount: ${ledgerDoc.amount}, type: ${ledgerDoc.type}`);
            console.log(`entryDate: ${ledgerDoc.entryDate}`);
            console.log(`description: ${ledgerDoc.description}`);
        } else {
            console.log('LedgerEntry 6a61c0f3723443486b35c711 NOT found in DB!');
        }

        const bankTxDoc = await BankTransaction.findOne({ $or: [{ _id: targetId }, { transactionId: '6671277000015633595' }] });
        console.log('\n--- DB Inspection for BankTransaction ---');
        if (bankTxDoc) {
            console.log('BankTransaction found in DB:');
            console.log(`_id: ${bankTxDoc._id}`);
            console.log(`runningBalance: ${bankTxDoc.runningBalance}`);
            console.log(`amount: ${bankTxDoc.amount}, type: ${bankTxDoc.type}`);
        } else {
            console.log('BankTransaction NOT found!');
        }

    } catch (err) {
        console.error(err);
    } finally {
        await mongoose.disconnect();
        process.exit(0);
    }
}

check();
