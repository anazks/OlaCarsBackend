/**
 * check_report_data.js
 * READ-ONLY diagnostic — no writes, no model changes.
 * Checks what data exists for:
 *   1. Financial Trend  (LedgerEntry collection)
 *   2. Driver Performance (drivers collection)
 */
require("dotenv").config();
const mongoose = require("mongoose");

const MONGO_URI = process.env.MONGO_URI;

const check = async () => {
    try {
        console.log("Connecting to MongoDB...");
        await mongoose.connect(MONGO_URI);
        console.log("Connected.\n");

        const db = mongoose.connection.db;

        // ─────────────────────────────────────────────────────────────
        // 1. FINANCIAL TREND — LedgerEntry collection
        // ─────────────────────────────────────────────────────────────
        console.log("═══════════════════════════════════════════");
        console.log(" FINANCIAL TREND  →  ledgerentries");
        console.log("═══════════════════════════════════════════");

        const ledgerColl = db.collection("ledgerentries");

        const totalLedger = await ledgerColl.countDocuments();
        console.log("Total LedgerEntry documents:", totalLedger);

        if (totalLedger === 0) {
            console.log("⚠️  NO LEDGER DATA — Financial Trend will be empty.");
        } else {
            // Date range of entries
            const [oldest] = await ledgerColl.find({}).sort({ entryDate: 1 }).limit(1).toArray();
            const [newest] = await ledgerColl.find({}).sort({ entryDate: -1 }).limit(1).toArray();
            console.log("Date range:", oldest?.entryDate?.toISOString().split("T")[0], "→", newest?.entryDate?.toISOString().split("T")[0]);

            // Breakdown by accounting code category
            const byCategory = await ledgerColl.aggregate([
                {
                    $lookup: {
                        from: "accountingcodes",
                        localField: "accountingCode",
                        foreignField: "_id",
                        as: "code"
                    }
                },
                { $unwind: { path: "$code", preserveNullAndEmptyArrays: false } },
                {
                    $group: {
                        _id: "$code.category",
                        count: { $sum: 1 },
                        totalAmount: { $sum: "$amount" }
                    }
                },
                { $sort: { _id: 1 } }
            ]).toArray();

            if (byCategory.length === 0) {
                console.log("⚠️  Ledger entries exist but none have linked AccountingCodes — Financial Trend will be empty.");
            } else {
                console.log("\nBreakdown by AccountingCode category:");
                byCategory.forEach(c =>
                    console.log(`   ${c._id || "(null)"} → ${c.count} entries, total amount: ${c.totalAmount.toFixed(2)}`)
                );
            }

            // Sample of 3 entries
            const samples = await ledgerColl.find({}).limit(3).toArray();
            console.log("\nSample entries (first 3):");
            samples.forEach((e, i) =>
                console.log(`  [${i + 1}] date=${e.entryDate?.toISOString().split("T")[0]}  type=${e.type}  amount=${e.amount}  accountingCode=${e.accountingCode}`)
            );
        }

        // ─────────────────────────────────────────────────────────────
        // 2. DRIVER PERFORMANCE — drivers collection
        // ─────────────────────────────────────────────────────────────
        console.log("\n═══════════════════════════════════════════");
        console.log(" DRIVER PERFORMANCE  →  drivers");
        console.log("═══════════════════════════════════════════");

        const driverColl = db.collection("drivers");

        const totalDrivers = await driverColl.countDocuments({ isDeleted: { $ne: true } });
        console.log("Total active drivers:", totalDrivers);

        if (totalDrivers === 0) {
            console.log("⚠️  NO DRIVER DATA — Driver Performance will be empty.");
        } else {
            // How many have performance data?
            const withPerf = await driverColl.countDocuments({
                isDeleted: { $ne: true },
                "performance.drivingScore": { $exists: true }
            });
            console.log("Drivers WITH performance field:", withPerf);
            if (withPerf === 0) {
                console.log("⚠️  No driver has a 'performance' sub-document — scores/distance will all be 0.");
            }

            // Rent tracking presence
            const withRent = await driverColl.countDocuments({
                isDeleted: { $ne: true },
                "rentTracking.0": { $exists: true }
            });
            console.log("Drivers WITH rent tracking entries:", withRent);

            // Status breakdown
            const byStatus = await driverColl.aggregate([
                { $match: { isDeleted: { $ne: true } } },
                { $group: { _id: "$status", count: { $sum: 1 } } },
                { $sort: { count: -1 } }
            ]).toArray();
            console.log("\nDriver status breakdown:");
            byStatus.forEach(s => console.log(`   ${s._id || "(null)"} → ${s.count}`));

            // Sample driver
            const sampleDriver = await driverColl.findOne({ isDeleted: { $ne: true } });
            if (sampleDriver) {
                console.log("\nSample driver fields (personalInfo + performance + rentTracking):");
                console.log("  fullName:", sampleDriver.personalInfo?.fullName);
                console.log("  status:", sampleDriver.status);
                console.log("  branch:", sampleDriver.branch);
                console.log("  performance:", JSON.stringify(sampleDriver.performance || {}));
                console.log("  rentTracking (last entry):", JSON.stringify(
                    sampleDriver.rentTracking?.slice(-1)[0] || null
                ));
            }
        }

        console.log("\n✅ Done. No data was written.\n");
        process.exit(0);
    } catch (err) {
        console.error("Error:", err.message);
        process.exit(1);
    }
};

check();
