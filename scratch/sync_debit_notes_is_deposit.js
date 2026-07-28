const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function run() {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB!');

        const db = mongoose.connection.db;

        // Set isDeposit: true for all DP debit notes
        const resTrue = await db.collection('debitnotes').updateMany(
            { debitNoteNumber: { $regex: /^DP/i } },
            { $set: { isDeposit: true, updatedAt: new Date() } }
        );

        // Set isDeposit: false for all non-DP debit notes
        const resFalse = await db.collection('debitnotes').updateMany(
            { debitNoteNumber: { $not: { $regex: /^DP/i } } },
            { $set: { isDeposit: false, updatedAt: new Date() } }
        );

        const totalDP = await db.collection('debitnotes').countDocuments({ isDeposit: true });
        const totalNonDP = await db.collection('debitnotes').countDocuments({ isDeposit: false });

        console.log(`Synchronization Complete!`);
        console.log(`- Deposit Debit Notes (isDeposit: true, starts with 'DP'): ${totalDP}`);
        console.log(`- Standard Debit Notes (isDeposit: false, non-DP): ${totalNonDP}`);

        await mongoose.disconnect();
        process.exit(0);
    } catch (err) {
        console.error('Error synchronizing debit notes:', err);
        process.exit(1);
    }
}

run();
