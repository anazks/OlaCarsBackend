const mongoose = require("mongoose");
require("dotenv").config();

const BankAccount = require("../Src/modules/BankAccount/Model/BankAccountModel");
const LedgerEntry = require("../Src/modules/Ledger/Model/LedgerEntryModel");

async function checkAccount() {
    try {
        await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI);
        console.log("Connected to Mongo");

        const accountId = "6a280e00abfae20029fc99ac";
        const account = await BankAccount.findById(accountId);
        if (!account) {
            console.log("Account not found:", accountId);
            process.exit(1);
        }

        console.log("Account details:");
        console.log({
            _id: account._id,
            accountName: account.accountName || account.bankName,
            accountType: account.accountType,
            initialBalance: account.initialBalance,
            currentBalance: account.currentBalance,
            accountingCode: account.accountingCode
        });

        const totalEntries = await LedgerEntry.countDocuments({ accountingCode: account.accountingCode });
        console.log("Total Ledger Entries for accountingCode:", totalEntries);

        // Get latest entry by date & id
        const latestEntry = await LedgerEntry.findOne({ accountingCode: account.accountingCode })
            .sort({ entryDate: -1, _id: -1 });

        console.log("Latest Entry (by entryDate -1):", {
            id: latestEntry?._id,
            entryDate: latestEntry?.entryDate,
            type: latestEntry?.type,
            amount: latestEntry?.amount,
            runningBalance: latestEntry?.runningBalance,
            description: latestEntry?.description
        });

        // Get latest entry by creation (natural order / createdAt)
        const latestCreated = await LedgerEntry.findOne({ accountingCode: account.accountingCode })
            .sort({ createdAt: -1 });
        console.log("Latest Created Entry (by createdAt -1):", {
            id: latestCreated?._id,
            entryDate: latestCreated?.entryDate,
            type: latestCreated?.type,
            amount: latestCreated?.amount,
            runningBalance: latestCreated?.runningBalance,
            description: latestCreated?.description
        });

        // Let's check date range: 2026-01-01 to today
        const startDate = "2026-01-01";
        const startD = new Date(startDate);
        startD.setHours(0,0,0,0);

        const priorEntries = await LedgerEntry.find({
            accountingCode: account.accountingCode,
            entryDate: { $lt: startD }
        });

        const priorAgg = await LedgerEntry.aggregate([
            { $match: { accountingCode: account.accountingCode, entryDate: { $lt: startD } } },
            { $group: { _id: null, debits: { $sum: { $cond: [{ $eq: ["$type", "DEBIT"] }, "$amount", 0] } }, credits: { $sum: { $cond: [{ $eq: ["$type", "CREDIT"] }, "$amount", 0] } } } }
        ]);
        console.log("Prior to 2026-01-01 Aggregation:", priorAgg);

        const periodAgg = await LedgerEntry.aggregate([
            { $match: { accountingCode: account.accountingCode, entryDate: { $gte: startD } } },
            { $group: { _id: null, debits: { $sum: { $cond: [{ $eq: ["$type", "DEBIT"] }, "$amount", 0] } }, credits: { $sum: { $cond: [{ $eq: ["$type", "CREDIT"] }, "$amount", 0] } } } }
        ]);
        console.log("Period (>= 2026-01-01) Aggregation:", periodAgg);

        const allAgg = await LedgerEntry.aggregate([
            { $match: { accountingCode: account.accountingCode } },
            { $group: { _id: null, debits: { $sum: { $cond: [{ $eq: ["$type", "DEBIT"] }, "$amount", 0] } }, credits: { $sum: { $cond: [{ $eq: ["$type", "CREDIT"] }, "$amount", 0] } } } }
        ]);
        console.log("All-time Aggregation:", allAgg);

        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

checkAccount();
