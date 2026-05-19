const mongoose = require("mongoose");
require("dotenv").config();

async function run() {
    await mongoose.connect(process.env.MONGO_URI);
    const db = mongoose.connection.db;
    
    const entries = await db.collection("ledgerentries").find({ manualJournal: { $ne: null } }).toArray();
    console.log(`\n=== LEDGER ENTRIES WITH MANUAL JOURNAL NOT NULL (${entries.length}) ===`);
    for (const entry of entries) {
        console.log({
            _id: entry._id,
            manualJournal: entry.manualJournal,
            accountingCode: entry.accountingCode,
            type: entry.type,
            amount: entry.amount,
            description: entry.description,
            createdAt: entry.createdAt
        });
    }
    process.exit(0);
}

run().catch(err => {
    console.error(err);
    process.exit(1);
});
