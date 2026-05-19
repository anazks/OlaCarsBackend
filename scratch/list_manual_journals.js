const mongoose = require("mongoose");
require("../Src/modules/Branch/Model/BranchModel.js");
require("../Src/modules/AccountingCode/Model/AccountingCodeModel.js");
const ManualJournal = require("../Src/modules/Ledger/Model/ManualJournalModel.js");
const LedgerEntry = require("../Src/modules/Ledger/Model/LedgerEntryModel.js");
require("dotenv").config();

async function run() {
    await mongoose.connect(process.env.MONGO_URI);
    
    const journals = await ManualJournal.find().populate("branch");
    console.log(`=== MANUAL JOURNALS (${journals.length}) ===`);
    for (const journal of journals) {
        console.log(`\nJournal ID: ${journal._id}`);
        console.log(`Journal Number: ${journal.journalNumber}`);
        console.log(`Date: ${journal.date}`);
        console.log(`Description: ${journal.description}`);
        console.log(`Branch: ${journal.branch ? journal.branch.name : 'N/A'}`);
        console.log(`Total Amount: $${journal.totalAmount}`);
        console.log(`Status: ${journal.status}`);
        
        // Find corresponding ledger entries
        const entries = await LedgerEntry.find({ manualJournal: journal._id }).populate("accountingCode");
        console.log(`--- Double Entry Lines (${entries.length}) ---`);
        for (const entry of entries) {
            console.log(`  Account: ${entry.accountingCode ? entry.accountingCode.code + ' - ' + entry.accountingCode.name : 'N/A'}`);
            console.log(`  Type: ${entry.type}`);
            console.log(`  Amount: $${entry.amount}`);
            console.log(`  Description: ${entry.description}`);
            console.log(`  ---------------------`);
        }
    }
    process.exit(0);
}

run().catch(err => {
    console.error(err);
    process.exit(1);
});
