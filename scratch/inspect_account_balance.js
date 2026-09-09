require("dotenv").config();
const mongoose = require("mongoose");
const BankAccount = require("../Src/modules/BankAccount/Model/BankAccountModel");
const LedgerEntry = require("../Src/modules/Ledger/Model/LedgerEntryModel");
const BankTransaction = require("../Src/modules/BankAccount/Model/BankTransactionModel");

const connectDB = require("../Src/config/dbConfig");

async function check() {
    try {
        await connectDB();
        console.log("Connected to DB");

        const accounts = await BankAccount.find({ isDeleted: false }).lean();
        console.log("Found bank accounts:", accounts.map(a => ({
            id: a._id,
            name: a.accountName || a.bankName,
            code: a.accountCode,
            accountingCode: a.accountingCode,
            initialBalance: a.initialBalance,
            currentBalance: a.currentBalance
        })));

        // Find Banco General 1601
        const bg = accounts.find(a => (a.accountName && a.accountName.includes("1601")) || (a.bankName && a.bankName.includes("1601")) || (a.accountCode && a.accountCode.includes("1601")));
        if (!bg) {
            console.log("Banco General AH 1601 not found specifically, checking all accounts...");
            return;
        }

        console.log("\nTarget Account:", bg);

        const accCodeId = bg.accountingCode;
        console.log("Accounting Code ID:", accCodeId);

        // Count ledger entries
        const ledgerEntriesCount = await LedgerEntry.countDocuments({ accountingCode: accCodeId });
        console.log("Ledger entries count:", ledgerEntriesCount);

        // Fetch all ledger entries sorted by entryDate: 1, createdAt: 1, _id: 1
        const entries = await LedgerEntry.find({ accountingCode: accCodeId }).sort({ entryDate: 1, createdAt: 1, _id: 1 }).lean();
        
        let sumDebits = 0;
        let sumCredits = 0;
        entries.forEach(e => {
            if (e.type === "DEBIT") sumDebits += e.amount;
            if (e.type === "CREDIT") sumCredits += e.amount;
        });

        console.log(`Total Debits (Deposits): ${sumDebits}`);
        console.log(`Total Credits (Withdrawals): ${sumCredits}`);
        console.log(`Initial Balance: ${bg.initialBalance || 0}`);
        console.log(`Initial + Debits - Credits = ${(bg.initialBalance || 0) + sumDebits - sumCredits}`);

        if (entries.length > 0) {
            const first = entries[0];
            const last = entries[entries.length - 1];
            console.log("First Entry:", {
                date: first.entryDate,
                type: first.type,
                amount: first.amount,
                runningBalance: first.runningBalance
            });
            console.log("Last Entry (chronologically latest):", {
                date: last.entryDate,
                type: last.type,
                amount: last.amount,
                runningBalance: last.runningBalance
            });
        }

        // Also check with date filter: 2026-01-01 to 2026-09-09
        const startD = new Date("2026-01-01T00:00:00.000Z");
        const endD = new Date("2026-09-09T23:59:59.999Z");

        const filteredEntries = await LedgerEntry.find({
            accountingCode: accCodeId,
            entryDate: { $gte: startD, $lte: endD }
        }).sort({ entryDate: 1, createdAt: 1, _id: 1 }).lean();

        console.log(`\nFiltered Entries (2026-01-01 to 2026-09-09) count: ${filteredEntries.length}`);
        let fDebits = 0, fCredits = 0;
        filteredEntries.forEach(e => {
            if (e.type === "DEBIT") fDebits += e.amount;
            if (e.type === "CREDIT") fCredits += e.amount;
        });
        console.log(`Filtered Debits: ${fDebits}, Filtered Credits: ${fCredits}`);

        const priorEntries = await LedgerEntry.find({
            accountingCode: accCodeId,
            entryDate: { $lt: startD }
        }).lean();
        let pDebits = 0, pCredits = 0;
        priorEntries.forEach(e => {
            if (e.type === "DEBIT") pDebits += e.amount;
            if (e.type === "CREDIT") pCredits += e.amount;
        });
        console.log(`Prior Debits (< 2026-01-01): ${pDebits}, Prior Credits: ${pCredits}`);
        const openingBal = (bg.initialBalance || 0) + pDebits - pCredits;
        console.log(`Opening Bal: ${openingBal}`);
        console.log(`Closing Bal (Opening + fDebits - fCredits): ${openingBal + fDebits - fCredits}`);

    } catch (err) {
        console.error("Error:", err);
    } finally {
        await mongoose.disconnect();
    }
}

check();
