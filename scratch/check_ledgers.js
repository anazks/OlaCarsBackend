const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/olacars";

async function run() {
    try {
        await mongoose.connect(MONGO_URI);
        const LedgerEntry = require('../Src/modules/Ledger/Model/LedgerEntryModel');
        const cutoffTime = new Date('2026-07-06T05:30:00.000Z');
        const count = await LedgerEntry.countDocuments({ createdAt: { $gte: cutoffTime } });
        console.log(`Verified: There are exactly ${count} ledger entries in the database created after today 11:00 AM local time.`);
    } catch (err) {
        console.error(err);
    } finally {
        await mongoose.connection.close();
    }
}

run();
