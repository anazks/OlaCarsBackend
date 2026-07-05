require("dotenv").config();
const mongoose = require("mongoose");
const LedgerEntry = require("../Src/modules/Ledger/Model/LedgerEntryModel");
const AccountingCode = require("../Src/modules/AccountingCode/Model/AccountingCodeModel");

const run = async () => {
  try {
    console.log("Connecting to MongoDB...");
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected.");

    const end = new Date("2026-06-15T23:59:59.999Z");
    const query = { isDeleted: { $ne: true }, entryDate: { $lte: end } };

    console.log("Total matching documents in LedgerEntry:", await LedgerEntry.countDocuments(query));

    // 1. Original Pipeline
    const originalPipeline = [
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

    console.log("Running original aggregation...");
    console.time("original_pipeline");
    const originalResult = await LedgerEntry.aggregate(originalPipeline);
    console.timeEnd("original_pipeline");
    console.log("Original results count:", originalResult.length);

    // 2. Optimized Pipeline (direct group)
    const optimizedPipeline = [
        { $match: query },
        {
            $group: {
                _id: "$accountingCode",
                debitSum: {
                    $sum: {
                        $cond: [ { $eq: ["$type", "DEBIT"] }, "$amount", 0 ]
                    }
                },
                creditSum: {
                    $sum: {
                        $cond: [ { $eq: ["$type", "CREDIT"] }, "$amount", 0 ]
                    }
                }
            }
        }
    ];

    console.log("Running optimized aggregation...");
    console.time("optimized_pipeline");
    const optimizedResult = await LedgerEntry.aggregate(optimizedPipeline);
    console.timeEnd("optimized_pipeline");
    console.log("Optimized results count:", optimizedResult.length);

    // Compare sums for a few codes to see if they differ
    const originalMap = {};
    originalResult.forEach(r => originalMap[r._id] = r);

    const diffs = [];
    optimizedResult.forEach(r => {
      const orig = originalMap[r._id];
      if (!orig) {
        diffs.push({ code: r._id, message: "Missing in original" });
      } else {
        const debitDiff = Math.abs(r.debitSum - orig.debitSum);
        const creditDiff = Math.abs(r.creditSum - orig.creditSum);
        if (debitDiff > 0.01 || creditDiff > 0.01) {
          diffs.push({
            code: r._id,
            debitDiff,
            creditDiff,
            optimized: { debit: r.debitSum, credit: r.creditSum },
            original: { debit: orig.debitSum, credit: orig.creditSum }
          });
        }
      }
    });

    console.log("Number of accounting codes with differing sums:", diffs.length);
    if (diffs.length > 0) {
      console.log("Sample differences (first 5):", JSON.stringify(diffs.slice(0, 5), null, 2));
    }

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

run();
