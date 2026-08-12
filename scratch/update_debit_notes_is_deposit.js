const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function run() {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB!');

        const db = mongoose.connection.db;

        // Step 1: Set isDeposit: true for all debit notes starting with "DP" (case-insensitive)
        const resTrue = await db.collection('debitnotes').updateMany(
            { debitNoteNumber: { $regex: /^DP/i } },
            { $set: { isDeposit: true } }
        );
        console.log(`- Set isDeposit: true on ${resTrue.modifiedCount} (matched: ${resTrue.matchedCount}) DP debit notes.`);

        // Step 2: Set isDeposit: false for all debit notes NOT starting with "DP"
        const resFalse = await db.collection('debitnotes').updateMany(
            { debitNoteNumber: { $not: { $regex: /^DP/i } } },
            { $set: { isDeposit: false } }
        );
        console.log(`- Set isDeposit: false on ${resFalse.modifiedCount} (matched: ${resFalse.matchedCount}) non-DP debit notes.`);

        // Total count check
        const totalDP = await db.collection('debitnotes').countDocuments({ isDeposit: true });
        const totalNonDP = await db.collection('debitnotes').countDocuments({ isDeposit: false });
        console.log(`Total Debit Notes in DB:`);
        console.log(`- Deposit Debit Notes (isDeposit: true, starts with DP): ${totalDP}`);
        console.log(`- Standard / Other Debit Notes (isDeposit: false, non-DP): ${totalNonDP}`);

        await mongoose.disconnect();
        process.exit(0);
    } catch (err) {
        console.error('Error updating debit notes isDeposit flag:', err);
        process.exit(1);
    }
}

run();
