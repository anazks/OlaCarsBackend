const mongoose = require("mongoose");
require("dotenv").config();

const BankAccount = require("../Src/modules/BankAccount/Model/BankAccountModel");
const LedgerEntry = require("../Src/modules/Ledger/Model/LedgerEntryModel");

async function checkSequence() {
    try {
        await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI);

        const accountId = "6a280e00abfae20029fc99ac";
        const account = await BankAccount.findById(accountId);

        // Fetch all entries ordered chronologically
        const entries = await LedgerEntry.find({ accountingCode: account.accountingCode })
            .sort({ entryDate: 1, createdAt: 1, _id: 1 });

        console.log(`Total entries: ${entries.length}`);

        // Find index of first entry in 2026
        const first2026Idx = entries.findIndex(e => new Date(e.entryDate) >= new Date("2026-01-01T00:00:00.000Z"));
        console.log(`First 2026 entry index: ${first2026Idx}`);

        if (first2026Idx > 0) {
            console.log("\n--- Last 5 entries of 2025 ---");
            for (let i = Math.max(0, first2026Idx - 5); i < first2026Idx; i++) {
                const e = entries[i];
                console.log(`[${i}] Date: ${e.entryDate.toISOString()}, Type: ${e.type}, Amount: ${e.amount}, RunningBal: ${e.runningBalance}, Desc: "${e.description.slice(0, 35)}"`);
            }
        }

        console.log("\n--- First 5 entries of 2026 ---");
        for (let i = first2026Idx; i < Math.min(entries.length, first2026Idx + 5); i++) {
            const e = entries[i];
            console.log(`[${i}] Date: ${e.entryDate.toISOString()}, Type: ${e.type}, Amount: ${e.amount}, RunningBal: ${e.runningBalance}, Desc: "${e.description.slice(0, 35)}"`);
        }

        process.exit(0);
    } catch(e) {
        console.error(e);
        process.exit(1);
    }
}

checkSequence();
