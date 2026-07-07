require("dotenv").config();
const mongoose = require("mongoose");
const LedgerEntry = require("../Src/modules/Ledger/Model/LedgerEntryModel");
const AccountingCode = require("../Src/modules/AccountingCode/Model/AccountingCodeModel");

const run = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected to MongoDB.");

    const end = new Date("2026-06-15T23:59:59.999Z");
    const query = { isDeleted: { $ne: true }, entryDate: { $lte: end } };

    // Test 1: Original pipeline with $trim and $toLower
    console.time("Pipeline 1 (With $trim and $toLower)");
    const pipeline1 = [
      { $match: query },
      {
        $group: {
          _id: {
            accountingCode: "$accountingCode",
            entryDate: { $dateToString: { format: "%Y-%m-%d", date: "$entryDate" } },
            type: "$type",
            amount: "$amount",
            description: { $trim: { input: { $toLower: "$description" } } }
          }
        }
      },
      {
        $group: {
          _id: "$_id.accountingCode",
          debitSum: { $sum: { $cond: [ { $eq: ["$_id.type", "DEBIT"] }, "$_id.amount", 0 ] } },
          creditSum: { $sum: { $cond: [ { $eq: ["$_id.type", "CREDIT"] }, "$_id.amount", 0 ] } }
        }
      }
    ];
    const res1 = await LedgerEntry.aggregate(pipeline1);
    console.timeEnd("Pipeline 1 (With $trim and $toLower)");

    // Test 2: Pipeline with raw description
    console.time("Pipeline 2 (Raw description)");
    const pipeline2 = [
      { $match: query },
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
          debitSum: { $sum: { $cond: [ { $eq: ["$_id.type", "DEBIT"] }, "$_id.amount", 0 ] } },
          creditSum: { $sum: { $cond: [ { $eq: ["$_id.type", "CREDIT"] }, "$_id.amount", 0 ] } }
        }
      }
    ];
    const res2 = await LedgerEntry.aggregate(pipeline2);
    console.timeEnd("Pipeline 2 (Raw description)");

    // Test 3: Pipeline without description grouping at all (just code, date, type, amount)
    console.time("Pipeline 3 (No description)");
    const pipeline3 = [
      { $match: query },
      {
        $group: {
          _id: {
            accountingCode: "$accountingCode",
            entryDate: { $dateToString: { format: "%Y-%m-%d", date: "$entryDate" } },
            type: "$type",
            amount: "$amount"
          }
        }
      },
      {
        $group: {
          _id: "$_id.accountingCode",
          debitSum: { $sum: { $cond: [ { $eq: ["$_id.type", "DEBIT"] }, "$_id.amount", 0 ] } },
          creditSum: { $sum: { $cond: [ { $eq: ["$_id.type", "CREDIT"] }, "$_id.amount", 0 ] } }
        }
      }
    ];
    const res3 = await LedgerEntry.aggregate(pipeline3);
    console.timeEnd("Pipeline 3 (No description)");

    console.log(`Results counts - P1: ${res1.length}, P2: ${res2.length}, P3: ${res3.length}`);

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

run();
