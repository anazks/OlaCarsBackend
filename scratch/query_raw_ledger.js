const mongoose = require("mongoose");
require("dotenv").config();

async function run() {
    await mongoose.connect(process.env.MONGO_URI);
    const db = mongoose.connection.db;
    const collections = await db.listCollections().toArray();
    console.log("Collections:", collections.map(c => c.name));
    
    const rawEntries = await db.collection("ledgerentries").find().toArray();
    console.log(`\n=== RAW LEDGER ENTRIES (${rawEntries.length}) ===`);
    for (const entry of rawEntries) {
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
