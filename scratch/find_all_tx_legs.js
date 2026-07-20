const mongoose = require('mongoose');
require('dotenv').config();

require('../Src/modules/AccountingCode/Model/AccountingCodeModel');
const LedgerEntry = require('../Src/modules/Ledger/Model/LedgerEntryModel');

async function run() {
    await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);
    console.log("Connected successfully.");

    const entries = await LedgerEntry.find({ transaction: "6a5b45d6ba8857a853dec9d0" }).populate('accountingCode');
    console.log(`\nLedger Entries for transaction "6a5b45d6ba8857a853dec9d0" (${entries.length} found):`);
    entries.forEach(e => {
        console.log(JSON.stringify(e, null, 2));
    });

    await mongoose.disconnect();
}

run().catch(err => console.error(err));
