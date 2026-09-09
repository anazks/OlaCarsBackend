const connectDB = require("../Src/config/dbConfig");
const BankAccount = require("../Src/modules/BankAccount/Model/BankAccountModel");
const { recalculateRunningBalances, syncAccountingCodeBalances } = require("../Src/modules/BankAccount/Service/BankAccountService");
const LedgerEntry = require("../Src/modules/Ledger/Model/LedgerEntryModel");

async function fixBalances() {
    await connectDB();
    console.log("Connected to MongoDB.");

    const accounts = await BankAccount.find({ isDeleted: false });
    console.log(`Found ${accounts.length} active bank accounts.`);

    for (const acc of accounts) {
        console.log(`Recalculating account: ${acc.accountName || acc.bankName} (${acc.accountCode})...`);
        await recalculateRunningBalances(acc._id);
        if (acc.accountingCode) {
            await syncAccountingCodeBalances(acc.accountingCode);
        }
        const updated = await BankAccount.findById(acc._id);
        console.log(` -> Updated currentBalance: ${updated.currentBalance}`);
    }

    // Now inspect Banco General AH 1601 specifically
    const bg = await BankAccount.findOne({
        isDeleted: false,
        $or: [
            { accountName: /1601/ },
            { bankName: /1601/ },
            { accountCode: "1.1.02-1" }
        ]
    });

    if (bg) {
        console.log("\n--- Verification for Banco General AH 1601 ---");
        console.log("Account currentBalance:", bg.currentBalance);

        // Fetch top 5 latest transactions by entryDate desc
        const topTxs = await LedgerEntry.find({ accountingCode: bg.accountingCode })
            .sort({ entryDate: -1, createdAt: -1, _id: -1 })
            .limit(5)
            .lean();

        console.log("Latest 5 LedgerEntries:");
        topTxs.forEach((tx, idx) => {
            console.log(`${idx + 1}. Date: ${tx.entryDate.toISOString()}, Type: ${tx.type}, Amount: ${tx.amount}, RunningBalance: ${tx.runningBalance}`);
        });
    }

    process.exit(0);
}

fixBalances();
