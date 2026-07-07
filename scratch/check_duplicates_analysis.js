require("dotenv").config();
const mongoose = require("mongoose");
const LedgerEntry = require("../Src/modules/Ledger/Model/LedgerEntryModel");

const run = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected to MongoDB.");

    const end = new Date("2026-06-15T23:59:59.999Z");
    const query = { isDeleted: { $ne: true }, entryDate: { $lte: end } };

    console.log("Fetching matching ledger entries...");
    const rawEntries = await LedgerEntry.find(query).select("accountingCode entryDate type amount description").lean();
    console.log(`Fetched ${rawEntries.length} entries.`);

    // 1. JS Deduplication
    const seenJS = new Set();
    let jsDupsCount = 0;
    const jsCleaned = [];

    rawEntries.forEach(e => {
      const dateStr = e.entryDate ? new Date(e.entryDate).toISOString().split('T')[0] : '';
      const cleanDesc = (e.description || '').replace(/\d+/g, "").toLowerCase().trim();
      const accountId = e.accountingCode ? e.accountingCode.toString() : '';
      
      const key = `${accountId}_${dateStr}_${e.type}_${e.amount || 0}_${cleanDesc}`;
      if (seenJS.has(key)) {
        jsDupsCount++;
      } else {
        seenJS.add(key);
        jsCleaned.push(e);
      }
    });

    // 2. Mongo-style Deduplication in JS
    const seenMongo = new Set();
    let mongoDupsCount = 0;
    const mongoCleaned = [];

    rawEntries.forEach(e => {
      const dateStr = e.entryDate ? new Date(e.entryDate).toISOString().split('T')[0] : '';
      const cleanDesc = (e.description || '').toLowerCase().trim(); // No digit removal
      const accountId = e.accountingCode ? e.accountingCode.toString() : '';

      const key = `${accountId}_${dateStr}_${e.type}_${e.amount || 0}_${cleanDesc}`;
      if (seenMongo.has(key)) {
        mongoDupsCount++;
      } else {
        seenMongo.add(key);
        mongoCleaned.push(e);
      }
    });

    console.log(`\nResults:`);
    console.log(`- Total Raw Entries: ${rawEntries.length}`);
    console.log(`- JS Deduplicated count: ${jsCleaned.length} (Duplicates removed: ${jsDupsCount})`);
    console.log(`- Mongo-style Deduplicated count: ${mongoCleaned.length} (Duplicates removed: ${mongoDupsCount})`);

    // Let's find entries that JS deduplicated but Mongo did not
    const mongoMap = new Set(mongoCleaned.map(e => e._id.toString()));
    const jsMap = new Set(jsCleaned.map(e => e._id.toString()));

    const diffEntries = rawEntries.filter(e => mongoMap.has(e._id.toString()) && !jsMap.has(e._id.toString()));
    console.log(`- Entries that JS deduplicated but Mongo did NOT: ${diffEntries.length}`);

    if (diffEntries.length > 0) {
      console.log("\nSample of differing duplicates (first 3):");
      diffEntries.slice(0, 3).forEach(e => {
        console.log(`\nEntry ID: ${e._id}`);
        console.log(`Code: ${e.accountingCode}`);
        console.log(`Date: ${e.entryDate}`);
        console.log(`Type: ${e.type}, Amount: ${e.amount}`);
        console.log(`Desc: "${e.description}"`);
      });
    }

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

run();
