const mongoose = require('mongoose');
require('dotenv').config();

async function run() {
    await mongoose.connect(process.env.MONGO_URI);
    const LedgerEntry = require('../Src/modules/Ledger/Model/LedgerEntryModel');
    const total = await LedgerEntry.countDocuments();
    console.log(`Total ledger entries in DB: ${total}`);
    const sample = await LedgerEntry.find().limit(5).lean();
    console.log('Sample entries:', sample);
    await mongoose.disconnect();
}

run().catch(console.error);
