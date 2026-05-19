const mongoose = require("mongoose");
require("../Src/modules/Branch/Model/BranchModel.js");
require("../Src/modules/AccountingCode/Model/AccountingCodeModel.js");
const ManualJournal = require("../Src/modules/Ledger/Model/ManualJournalModel.js");
const LedgerEntry = require("../Src/modules/Ledger/Model/LedgerEntryModel.js");
require("dotenv").config();

async function run() {
    // 1. Login to get token
    console.log("Logging in...");
    const loginRes = await fetch("http://localhost:3000/api/finance-admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            email: "financialadmin@olacars.com",
            password: "Test@1234"
        })
    });
    
    if (!loginRes.ok) {
        throw new Error(`Login failed with status: ${loginRes.status} ${await loginRes.text()}`);
    }
    
    const loginData = await loginRes.json();
    const token = loginData.accessToken;
    console.log("Logged in successfully! Token received.");
    
    // Connect to DB to find branch and accounts
    await mongoose.connect(process.env.MONGO_URI);
    const Branch = mongoose.model("Branch");
    const branch = await Branch.findOne();
    const AccountingCode = mongoose.model("AccountingCode");
    const codes = await AccountingCode.find().limit(2);
    
    console.log("Posting manual journal via API...");
    const payload = {
        description: "API Tested Double Entry Manual Journal",
        date: new Date().toISOString().split('T')[0],
        branch: branch._id.toString(),
        lines: [
            {
                accountingCode: codes[0]._id.toString(),
                type: "DEBIT",
                amount: 250,
                description: "API Debit leg"
            },
            {
                accountingCode: codes[1]._id.toString(),
                type: "CREDIT",
                amount: 250,
                description: "API Credit leg"
            }
        ]
    };
    
    const response = await fetch("http://localhost:3000/api/ledger/journals", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
    });
    
    if (!response.ok) {
        throw new Error(`Post failed with status: ${response.status} ${await response.text()}`);
    }
    
    const resData = await response.json();
    console.log("API Response status:", resData.status);
    
    // Verify in DB
    const journalId = resData.data.journal._id;
    const dbJournal = await ManualJournal.findById(journalId);
    const dbEntries = await LedgerEntry.find({ manualJournal: journalId }).populate("accountingCode");
    
    console.log("\n=== DATABASE VERIFICATION ===");
    console.log("Journal:", dbJournal.journalNumber, "-", dbJournal.description);
    console.log("Ledger Entries found:", dbEntries.length);
    for (const entry of dbEntries) {
        console.log(`- Account: ${entry.accountingCode.code} (${entry.type}), Amount: $${entry.amount}, Description: ${entry.description}`);
    }
    
    process.exit(0);
}

run().catch(err => {
    console.error("ERROR:");
    console.error(err.message);
    process.exit(1);
});
