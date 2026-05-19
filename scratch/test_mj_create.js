const mongoose = require("mongoose");
require("../Src/modules/Branch/Model/BranchModel.js");
require("../Src/modules/AccountingCode/Model/AccountingCodeModel.js");
const ManualJournalService = require("../Src/modules/Ledger/Service/ManualJournalService.js");
require("dotenv").config();

async function run() {
    await mongoose.connect(process.env.MONGO_URI);
    
    // Get a valid branch
    const Branch = mongoose.model("Branch");
    const branch = await Branch.findOne();
    if (!branch) {
        console.log("No branches found. Please seed branches first.");
        process.exit(1);
    }
    
    // Get valid accounting codes
    const AccountingCode = mongoose.model("AccountingCode");
    const codes = await AccountingCode.find().limit(2);
    if (codes.length < 2) {
        console.log("Not enough accounting codes found.");
        process.exit(1);
    }
    
    console.log("Using Branch:", branch.name);
    console.log("Using Account 1:", codes[0].code, codes[0].name);
    console.log("Using Account 2:", codes[1].code, codes[1].name);
    
    const payload = {
        description: "Test Double Entry Manual Journal",
        date: new Date(),
        branch: branch._id,
        createdBy: new mongoose.Types.ObjectId(), // Fake admin ID
        creatorRole: "ADMIN",
        lines: [
            {
                accountingCode: codes[0]._id.toString(),
                type: "DEBIT",
                amount: 100,
                description: "Test debit line"
            },
            {
                accountingCode: codes[1]._id.toString(),
                type: "CREDIT",
                amount: 100,
                description: "Test credit line"
            }
        ]
    };
    
    try {
        console.log("Attempting to create manual journal...");
        const result = await ManualJournalService.createManualJournal(payload);
        console.log("SUCCESS!");
        console.log("Journal:", result.journal);
        console.log("Ledger Entries:", result.ledgerEntries);
    } catch (err) {
        console.error("FAILED WITH ERROR:");
        console.error(err);
    }
    
    process.exit(0);
}

run().catch(err => {
    console.error(err);
    process.exit(1);
});
