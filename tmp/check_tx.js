const mongoose = require("mongoose");
require("dotenv").config();

const BankAccount = require("../Src/modules/BankAccount/Model/BankAccountModel");
const LedgerEntry = require("../Src/modules/Ledger/Model/LedgerEntryModel");

async function checkTx() {
    try {
        await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI);
        const accountId = "6a280e00abfae20029fc99ac";
        const account = await BankAccount.findById(accountId);

        const startDate = "2026-01-01";
        const endDate = "2026-08-03";
        const startD = new Date(startDate);
        startD.setHours(0,0,0,0);
        const endD = new Date(endDate);
        endD.setHours(23,59,59,999);

        // Query used by getBankTransactions when date filters are active:
        const query = {
            accountingCode: account.accountingCode,
            entryDate: { $gte: startD, $lte: endD }
        };

        // Descending order sort (default in frontend)
        const descEntries = await LedgerEntry.find(query)
            .sort({ entryDate: -1, _id: -1 })
            .limit(10);

        console.log("Top 10 entries DESC (newest first):");
        descEntries.forEach((tx, idx) => {
            console.log(`[${idx+1}] Date: ${tx.entryDate.toISOString().slice(0,10)}, Type: ${tx.type}, Amount: ${tx.amount}, RunningBalance: ${tx.runningBalance}, Desc: "${tx.description.slice(0, 30)}"`);
        });

        // Ascending order sort
        const ascEntries = await LedgerEntry.find(query)
            .sort({ entryDate: 1, _id: 1 })
            .limit(10);

        console.log("\nTop 10 entries ASC (oldest first in filtered range):");
        ascEntries.forEach((tx, idx) => {
            console.log(`[${idx+1}] Date: ${tx.entryDate.toISOString().slice(0,10)}, Type: ${tx.type}, Amount: ${tx.amount}, RunningBalance: ${tx.runningBalance}, Desc: "${tx.description.slice(0, 30)}"`);
        });

        // Search for 38045 or see all runningBalances
        const allFiltered = await LedgerEntry.find(query).sort({ entryDate: -1, _id: -1 });
        const runningBals = allFiltered.map(t => t.runningBalance);
        console.log("\nFirst 5 runningBalances in DESC order:", runningBals.slice(0, 5));
        console.log("Last 5 runningBalances in DESC order:", runningBals.slice(-5));
        console.log("Max runningBalance:", Math.max(...runningBals.filter(b => b !== undefined)));

        // Find entry with running balance ~ 38045.17
        const targetEntry = allFiltered.find(t => t.runningBalance && Math.abs(t.runningBalance - 38045.17) < 1);
        if (targetEntry) {
            console.log("\nFound entry matching ~ 38045.17:", {
                date: targetEntry.entryDate,
                type: targetEntry.type,
                amount: targetEntry.amount,
                runningBalance: targetEntry.runningBalance,
                desc: targetEntry.description
            });
        } else {
            console.log("\nNo entry with runningBalance ~ 38045.17 found in filtered range!");
            // Check all-time
            const allTimeTarget = await LedgerEntry.findOne({
                accountingCode: account.accountingCode,
                runningBalance: { $gte: 38044, $lte: 38046 }
            });
            console.log("All-time target entry:", allTimeTarget ? {
                date: allTimeTarget.entryDate,
                runningBalance: allTimeTarget.runningBalance,
                desc: allTimeTarget.description
            } : "None");
        }

        process.exit(0);
    } catch(e) {
        console.error(e);
        process.exit(1);
    }
}

checkTx();
