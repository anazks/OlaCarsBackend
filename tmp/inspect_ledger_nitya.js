const mongoose = require("mongoose");
const path = require("path");

async function run() {
  try {
    require("dotenv").config({ path: path.join(__dirname, "../.env") });
    const mongoUri = process.env.MONGO_URI || "mongodb://localhost:27017/olacars";
    await mongoose.connect(mongoUri);

    require("../Src/modules/Ledger/Model/LedgerEntryModel");
    const LedgerEntry = mongoose.model("LedgerEntry");

    const codeId = "6a280daa4f5923cd64ec3161"; // Nitzia-Petty Cash
    const end = new Date("2026-06-15T23:59:59.999Z");

    const query = { accountingCode: codeId, entryDate: { $lte: end } };
    
    // Fetch all entries up to date sorted in different ways
    const entriesById = await LedgerEntry.find(query).sort({ entryDate: -1, _id: -1 }).lean();
    const entriesByCreated = await LedgerEntry.find(query).sort({ entryDate: -1, createdAt: -1 }).lean();
    const entriesBySequence = await LedgerEntry.find(query).sort({ entryDate: -1, runningBalance: -1 }).lean();
    
    console.log(`\n================ INSPECTION FOR CODE ${codeId} ================`);
    console.log(`Total entries found: ${entriesById.length}`);

    console.log(`\n--- FIRST 5 ENTRIES SORTED BY { entryDate: -1, _id: -1 } ---`);
    entriesById.slice(0, 5).forEach((e, idx) => {
        console.log(`[${idx}] ID: ${e._id}, Date: ${e.entryDate.toISOString()}, Type: ${e.type}, Amount: ${e.amount}, RunningBalance: ${e.runningBalance}, Desc: "${e.description}"`);
    });

    console.log(`\n--- FIRST 5 ENTRIES SORTED BY { entryDate: -1, createdAt: -1 } ---`);
    entriesByCreated.slice(0, 5).forEach((e, idx) => {
        console.log(`[${idx}] ID: ${e._id}, Date: ${e.entryDate.toISOString()}, Type: ${e.type}, Amount: ${e.amount}, RunningBalance: ${e.runningBalance}, Desc: "${e.description}"`);
    });

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

run();
