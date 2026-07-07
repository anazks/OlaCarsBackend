require("dotenv").config();
const mongoose = require("mongoose");
const LedgerEntry = require("../Src/modules/Ledger/Model/LedgerEntryModel");
const AccountingCode = require("../Src/modules/AccountingCode/Model/AccountingCodeModel");

const run = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected to MongoDB.");

    const codeDoc = await AccountingCode.findOne({ code: "10002" });
    if (!codeDoc) {
        console.log("Accounting code 10002 not found!");
        process.exit(1);
    }
    console.log(`Found code: ${codeDoc.name} (${codeDoc._id})`);

    const end = new Date("2026-06-15T23:59:59.999Z");
    const query = { isDeleted: { $ne: true }, entryDate: { $lte: end }, accountingCode: codeDoc._id };

    const rawEntries = await LedgerEntry.find(query).lean();
    console.log(`Total raw entries in ledger: ${rawEntries.length}`);
    
    let totalDebit = 0;
    let totalCredit = 0;
    rawEntries.forEach(e => {
        if (e.type === "DEBIT") totalDebit += e.amount;
        if (e.type === "CREDIT") totalCredit += e.amount;
        console.log(`- Date: ${e.entryDate.toISOString().split('T')[0]}, Type: ${e.type}, Amount: ${e.amount}, Desc: "${e.description}"`);
    });

    console.log(`\nRaw totals: Debit: ${totalDebit}, Credit: ${totalCredit}, Credit-Debit: ${totalCredit - totalDebit}`);

    // Let's run the balance sheet pipeline for this code
    const pipeline = [
        { $match: { isDeleted: { $ne: true }, entryDate: { $lte: end }, accountingCode: codeDoc._id } },
        {
            $group: {
                _id: {
                    accountingCode: "$accountingCode",
                    entryDate: { $dateToString: { format: "%Y-%m-%d", date: "$entryDate" } },
                    type: "$type",
                    amount: "$amount",
                    description: "$description"
                }
            }
        },
        {
            $group: {
                _id: "$_id.accountingCode",
                debitSum: {
                    $sum: {
                        $cond: [ { $eq: ["$_id.type", "DEBIT"] }, "$_id.amount", 0 ]
                    }
                },
                creditSum: {
                    $sum: {
                        $cond: [ { $eq: ["$_id.type", "CREDIT"] }, "$_id.amount", 0 ]
                    }
                }
            }
        }
    ];

    const aggregated = await LedgerEntry.aggregate(pipeline);
    console.log("\nPipeline result:", JSON.stringify(aggregated, null, 2));

    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

run();
