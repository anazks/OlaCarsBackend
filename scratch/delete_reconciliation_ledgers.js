const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/olacars";

async function run() {
    try {
        console.log("Connecting to:", MONGO_URI);
        await mongoose.connect(MONGO_URI);
        console.log("Connected successfully!\n");

        const LedgerEntry = require('../Src/modules/Ledger/Model/LedgerEntryModel');

        // July 6, 2026 at 11:00 AM local time (GMT+5:30) is 2026-07-06T05:30:00.000Z in UTC
        const cutoffTime = new Date('2026-07-06T05:30:00.000Z');
        console.log("Cutoff time (UTC):", cutoffTime.toISOString());

        // Find ledger entries created after cutoff time
        const entries = await LedgerEntry.find({
            createdAt: { $gte: cutoffTime }
        });

        console.log(`Found ${entries.length} ledger entries created after ${cutoffTime.toLocaleTimeString()} (${cutoffTime.toISOString()})`);

        if (entries.length > 0) {
            console.log("Sample entry description:", entries[0].description);
            
            // Delete them
            const deleteResult = await LedgerEntry.deleteMany({
                createdAt: { $gte: cutoffTime }
            });
            console.log(`Successfully deleted ${deleteResult.deletedCount} ledger entries.`);
        } else {
            console.log("No ledger entries found to delete.");
        }

    } catch (err) {
        console.error("Error executing operation:", err);
    } finally {
        await mongoose.connection.close();
        console.log("\nConnection closed.");
    }
}

run();
