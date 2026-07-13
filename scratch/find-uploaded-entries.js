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

    // 5:00 PM today local time (GMT+5:30) is 11:30 AM UTC
    const cutoffTime = new Date('2026-07-13T11:30:00.000Z');
    console.log(`Searching for entries created on or after: ${cutoffTime.toISOString()}`);

    const txs = await BankTransaction.find({ createdAt: { $gte: cutoffTime } }).populate('bankAccount');
    console.log(`Found ${txs.length} Bank Transactions:`);
    txs.forEach((tx, idx) => {
        console.log(`[${idx + 1}] ID: ${tx._id}, Account: ${tx.bankAccount?.accountName || tx.bankAccount?.bankName}, Amount: ${tx.amount}, Type: ${tx.type}, Desc: ${tx.description}, CreatedAt: ${tx.createdAt.toISOString()}`);
    });

    const ledgers = await LedgerEntry.find({ createdAt: { $gte: cutoffTime } });
    console.log(`\nFound ${ledgers.length} Ledger Entries:`);
    ledgers.forEach((l, idx) => {
        console.log(`[${idx + 1}] ID: ${l._id}, Amount: ${l.amount}, Type: ${l.type}, Desc: ${l.description}, CreatedAt: ${l.createdAt.toISOString()}`);
    });

    await mongoose.disconnect();
}

run().catch(console.error);
