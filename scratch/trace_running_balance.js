const connectDB = require("../Src/config/dbConfig");
const BankAccount = require("../Src/modules/BankAccount/Model/BankAccountModel");
const LedgerEntry = require("../Src/modules/Ledger/Model/LedgerEntryModel");
const BankTransaction = require("../Src/modules/BankAccount/Model/BankTransactionModel");

async function traceRecalculation() {
    await connectDB();
    console.log("Connected.");

    const bg = await BankAccount.findOne({
        isDeleted: false,
        $or: [
            { accountName: /1601/ },
            { bankName: /1601/ },
            { accountCode: "1.1.02-1" }
        ]
    });

    console.log("Found account:", bg.accountName, "ID:", bg._id, "AccountingCode:", bg.accountingCode);

    // Fetch all Ledger entries sorted by entryDate: 1, createdAt: 1, _id: 1
    const entries = await LedgerEntry.find({ accountingCode: bg.accountingCode })
        .sort({ entryDate: 1, createdAt: 1, _id: 1 })
        .lean();

    console.log(`Total entries: ${entries.length}`);

    let accum = bg.initialBalance || 0;
    let maxDiff = 0;
    let diffCount = 0;
    let firstMismatch = null;

    for (let i = 0; i < entries.length; i++) {
        const e = entries[i];
        if (e.type === 'DEBIT') {
            accum += e.amount;
        } else if (e.type === 'CREDIT') {
            accum -= e.amount;
        }

        const diff = Math.abs((e.runningBalance || 0) - accum);
        if (diff > 0.01) {
            diffCount++;
            if (diff > maxDiff) maxDiff = diff;
            if (!firstMismatch) {
                firstMismatch = {
                    index: i,
                    id: e._id,
                    entryDate: e.entryDate,
                    createdAt: e.createdAt,
                    type: e.type,
                    amount: e.amount,
                    storedRunningBalance: e.runningBalance,
                    calculatedAccum: accum,
                    diff
                };
            }
        }
    }

    console.log(`Final calculated accum: ${accum}`);
    console.log(`Stored running balance on last entry: ${entries[entries.length - 1].runningBalance}`);
    console.log(`Diff count: ${diffCount} out of ${entries.length}`);
    console.log(`Max diff: ${maxDiff}`);
    console.log("First mismatch:", firstMismatch);

    // Also check BankTransactions for this bank account
    const bankTxs = await BankTransaction.find({ bankAccount: bg._id })
        .sort({ entryDate: 1, createdAt: 1, _id: 1 })
        .lean();

    console.log(`\nBankTransactions count: ${bankTxs.length}`);
    let btAccum = bg.initialBalance || 0;
    for (const bt of bankTxs) {
        if (bt.type === 'DEBIT') btAccum += bt.amount;
        else if (bt.type === 'CREDIT') btAccum -= bt.amount;
    }
    console.log(`BankTransactions final calculated accum: ${btAccum}`);
    if (bankTxs.length > 0) {
        console.log(`BankTransactions stored running balance on last tx: ${bankTxs[bankTxs.length - 1].runningBalance}`);
    }

    process.exit(0);
}

traceRecalculation();
