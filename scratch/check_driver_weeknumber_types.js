require('dotenv').config();
const mongoose = require('mongoose');

async function run() {
    try {
        console.log("Connecting to MongoDB...");
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Connected successfully.\n");

        const db = mongoose.connection.db;
        const driversCol = db.collection('drivers');

        console.log("=== CHECKING DRIVER RENT TRACKING WEEK NUMBERS ===");

        // 1. Find drivers where weekNumber is stored as a string
        const stringWeekNumDrivers = await driversCol.find({
            isDeleted: false,
            "rentTracking.weekNumber": { $type: "string" }
        }).project({ driverId: 1, "personalInfo.fullName": 1, rentTracking: 1 }).toArray();

        console.log(`Found ${stringWeekNumDrivers.length} drivers with string weekNumbers.`);
        if (stringWeekNumDrivers.length > 0) {
            for (const d of stringWeekNumDrivers) {
                const stringWeeks = d.rentTracking
                    .filter(t => typeof t.weekNumber === 'string')
                    .map(t => ({ weekNumber: t.weekNumber, weekLabel: t.weekLabel }));
                console.log(`  Driver ${d.driverId} (${d.personalInfo?.fullName}):`);
                console.log(`    String weekNumbers:`, stringWeeks);
            }
        }

        // 2. Find drivers where weekNumber is corrupted (e.g. huge values like 1.111e+55)
        const hugeWeekNumDrivers = await driversCol.find({
            isDeleted: false,
            "rentTracking.weekNumber": { $gt: 1000 }
        }).project({ driverId: 1, "personalInfo.fullName": 1, rentTracking: 1 }).toArray();

        console.log(`\nFound ${hugeWeekNumDrivers.length} drivers with corrupted/huge weekNumbers (> 1000).`);
        if (hugeWeekNumDrivers.length > 0) {
            for (const d of hugeWeekNumDrivers) {
                const hugeWeeks = d.rentTracking
                    .filter(t => typeof t.weekNumber === 'number' && t.weekNumber > 1000)
                    .map(t => ({ weekNumber: t.weekNumber, weekLabel: t.weekLabel }));
                console.log(`  Driver ${d.driverId} (${d.personalInfo?.fullName}):`);
                console.log(`    Huge weekNumbers:`, hugeWeeks);
            }
        }

        // 3. Overall count check of rent tracking elements that are strings
        const totalDrivers = await driversCol.countDocuments({ isDeleted: false });
        console.log(`\nTotal non-deleted drivers in DB: ${totalDrivers}`);

        console.log("\n=== DONE ===");
    } catch (err) {
        console.error("Error executing check script:", err);
    } finally {
        await mongoose.disconnect();
        console.log("Disconnected from MongoDB.");
    }
}

run();
