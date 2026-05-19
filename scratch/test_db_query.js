const mongoose = require("mongoose");
const ManualJournal = require("../Src/modules/Ledger/Model/ManualJournalModel.js");
require("dotenv").config();

async function run() {
    await mongoose.connect(process.env.MONGO_URI);
    
    const startDateStr = "2026-05-01";
    const endDateStr = "2026-05-31";
    
    const query = {
        date: {
            $gte: new Date(startDateStr),
            $lte: new Date(endDateStr + "T23:59:59.999Z")
        }
    };
    
    console.log("Query object:", JSON.stringify(query, null, 2));
    console.log("Parsed GTE Date:", query.date.$gte);
    console.log("Parsed LTE Date:", query.date.$lte);
    
    const journals = await ManualJournal.find(query);
    console.log("Matched journals length:", journals.length);
    for (const j of journals) {
        console.log(`- ${j.journalNumber}: ${j.date.toISOString()} (${j.description})`);
    }
    
    process.exit(0);
}

run().catch(err => {
    console.error(err);
    process.exit(1);
});
