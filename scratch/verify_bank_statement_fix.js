const connectDB = require("../Src/config/dbConfig");
const BankAccount = require("../Src/modules/BankAccount/Model/BankAccountModel");
const LedgerEntry = require("../Src/modules/Ledger/Model/LedgerEntryModel");

async function verifyFix() {
    await connectDB();
    console.log("Connected to MongoDB.");

    const account = await BankAccount.findOne({
        isDeleted: false,
        $or: [
            { accountName: /1601/ },
            { bankName: /1601/ },
            { accountCode: "1.1.02-1" }
        ]
    });

    console.log("Checking Account:", account.accountName, "Code:", account.accountCode);

    // 1. Calculate dynamic closing balance (same logic as getBankTransactions controller)
    const startDate = "2026-01-01";
    const endDate = "2026-09-09";

    const query = { accountingCode: account.accountingCode };
    const startD = new Date(startDate);
    startD.setHours(0, 0, 0, 0);
    const endD = new Date(endDate);
    endD.setHours(23, 59, 59, 999);
    query.entryDate = { $gte: startD, $lte: endD };

    const totalsResult = await LedgerEntry.aggregate([
        { $match: query },
        {
            $group: {
                _id: null,
                totalDeposits: {
                    $sum: { $cond: [{ $eq: ["$type", "DEBIT"] }, "$amount", 0] }
                },
                totalWithdrawals: {
                    $sum: { $cond: [{ $eq: ["$type", "CREDIT"] }, "$amount", 0] }
                }
            }
        }
    ]);

    const totalDeposits = totalsResult.length > 0 ? totalsResult[0].totalDeposits : 0;
    const totalWithdrawals = totalsResult.length > 0 ? totalsResult[0].totalWithdrawals : 0;

    let openingBalance = account.initialBalance || 0;
    const priorQuery = {
        accountingCode: account.accountingCode,
        entryDate: { $lt: new Date(startDate) }
    };
    const priorTotals = await LedgerEntry.aggregate([
        { $match: priorQuery },
        {
            $group: {
                _id: null,
                totalDeposits: {
                    $sum: { $cond: [{ $eq: ["$type", "DEBIT"] }, "$amount", 0] }
                },
                totalWithdrawals: {
                    $sum: { $cond: [{ $eq: ["$type", "CREDIT"] }, "$amount", 0] }
                }
            }
        }
    ]);

    if (priorTotals.length > 0) {
        openingBalance = (account.initialBalance || 0) + (priorTotals[0].totalDeposits - priorTotals[0].totalWithdrawals);
    }

    const closingBalance = openingBalance + totalDeposits - totalWithdrawals;

    // 2. Fetch newest transaction in date range (sort desc)
    const latestTx = await LedgerEntry.findOne(query).sort({ entryDate: -1, _id: -1 }).lean();

    console.log("=== RESULTS ===");
    console.log("Opening Balance (01-01-2026):", openingBalance.toFixed(2));
    console.log("Total Deposits:", totalDeposits.toFixed(2));
    console.log("Total Withdrawals:", totalWithdrawals.toFixed(2));
    console.log("Header Card Ending Balance:", closingBalance.toFixed(2));
    console.log("Latest Transaction Date:", latestTx.entryDate.toISOString());
    console.log("Latest Transaction Description:", latestTx.description.substring(0, 60));
    console.log("Latest Transaction Running Balance:", latestTx.runningBalance.toFixed(2));
    console.log("MATCH STATUS:", Math.abs(closingBalance - latestTx.runningBalance) < 0.01 ? "SUCCESS! BALANCES MATCH PERFECTLY" : "MISMATCH!");

    process.exit(0);
}

verifyFix();
