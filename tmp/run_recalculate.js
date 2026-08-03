const mongoose = require("mongoose");
require("dotenv").config();

const { recalculateRunningBalances } = require("../Src/modules/BankAccount/Service/BankAccountService");
const BankAccount = require("../Src/modules/BankAccount/Model/BankAccountModel");
const LedgerEntry = require("../Src/modules/Ledger/Model/LedgerEntryModel");

async function run() {
    try {
        await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI);
        console.log("Connected to Mongo");

        const accountId = "6a280e00abfae20029fc99ac";
        console.log("Running recalculateRunningBalances for account:", accountId);

        const newBal = await recalculateRunningBalances(accountId);
        console.log("Recalculation complete. Updated account currentBalance:", newBal);

        const account = await BankAccount.findById(accountId);
        console.log("Updated account currentBalance in DB:", account.currentBalance);

        // Check latest entry
        const latestEntry = await LedgerEntry.findOne({ accountingCode: account.accountingCode })
            .sort({ entryDate: -1, _id: -1 });

        console.log("Latest Entry runningBalance after recalculate:", {
            id: latestEntry?._id,
            date: latestEntry?.entryDate,
            amount: latestEntry?.amount,
            type: latestEntry?.type,
            runningBalance: latestEntry?.runningBalance
        });

        process.exit(0);
    } catch(e) {
        console.error("Error running recalculateRunningBalances:", e);
        process.exit(1);
    }
}

run();
