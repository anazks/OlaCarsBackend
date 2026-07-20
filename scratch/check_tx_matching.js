require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../Src/config/dbConfig');
const LedgerEntry = require('../Src/modules/Ledger/Model/LedgerEntryModel');
const BankTransaction = require('../Src/modules/BankAccount/Model/BankTransactionModel');

(async () => {
    await connectDB();
    const ledgerEntries = await LedgerEntry.find({}).limit(10);
    for (const le of ledgerEntries) {
        console.log(`\nLedgerEntry ID: ${le._id}`);
        console.log(`  Date: ${le.entryDate} (${le.entryDate.getTime()})`);
        console.log(`  Amount: ${le.amount}, Type: ${le.type}`);
        console.log(`  Desc: ${le.description}`);
        console.log(`  TxId: ${le.transactionId}`);

        // Try exact match
        const exactMatch = await BankTransaction.findOne({
            $or: [
                { transactionId: le.transactionId },
                { entryDate: le.entryDate, amount: le.amount, type: le.type }
            ]
        });
        console.log(`  Exact Match Found: ${exactMatch ? exactMatch._id : 'NO'}`);

        if (!exactMatch) {
            // Try tolerance match
            const dateStart = new Date(le.entryDate);
            dateStart.setMinutes(dateStart.getMinutes() - 1);
            const dateEnd = new Date(le.entryDate);
            dateEnd.setMinutes(dateEnd.getMinutes() + 1);

            const toleranceMatch = await BankTransaction.findOne({
                amount: le.amount,
                type: le.type,
                entryDate: { $gte: dateStart, $lte: dateEnd }
            });
            console.log(`  Tolerance Match Found: ${toleranceMatch ? toleranceMatch._id : 'NO'}`);
        }
    }
    process.exit(0);
})();
