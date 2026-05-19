const mongoose = require("mongoose");
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
    
    const loginData = await loginRes.json();
    const token = loginData.accessToken;
    
    // Find a manual journal
    await mongoose.connect(process.env.MONGO_URI);
    const ManualJournal = require("../Src/modules/Ledger/Model/ManualJournalModel.js");
    const journal = await ManualJournal.findOne({ description: "API Tested Double Entry Manual Journal" });
    if (!journal) {
        console.log("No tested journal found.");
        process.exit(1);
    }
    
    console.log(`Fetching ledger entries for journal ID ${journal._id} using API...`);
    const response = await fetch(`http://localhost:3000/api/ledger?manualJournal=${journal._id}`, {
        method: "GET",
        headers: {
            Authorization: `Bearer ${token}`
        }
    });
    
    if (!response.ok) {
        throw new Error(`GET failed with status: ${response.status} ${await response.text()}`);
    }
    
    const resData = await response.json();
    console.log("\n=== GET LEDGER ENTRIES API RESPONSE ===");
    console.log("Status:", resData.success);
    console.log("Entries count:", resData.data.length);
    for (const entry of resData.data) {
        console.log({
            _id: entry._id,
            manualJournal: entry.manualJournal,
            type: entry.type,
            amount: entry.amount,
            description: entry.description,
            accountingCode: entry.accountingCode ? `${entry.accountingCode.code} - ${entry.accountingCode.name}` : null
        });
    }
    
    process.exit(0);
}

run().catch(err => {
    console.error("ERROR:");
    console.error(err.message);
    process.exit(1);
});
