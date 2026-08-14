const mongoose = require('mongoose');
require('dotenv').config({ path: 'c:/Users/anton/OneDrive/Documents/vs coding/OlaCarsBackend/.env' });

const { Driver } = require('../Src/modules/Driver/Model/DriverModel');

async function fixActiveDriverRentPlans() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Connected to MongoDB...");

        const targetId = '6a7d8d05d3daf44b70ef8610';
        const targetDriver = await Driver.findById(targetId);
        if (targetDriver) {
            console.log(`Target driver: ${targetDriver.personalInfo?.fullName}`);
            console.log(`Status: ${targetDriver.status}`);
            console.log(`DeactivationDate: ${targetDriver.deactivationDate}`);
            console.log(`Rent tracking count: ${targetDriver.rentTracking?.length}`);
            const cancelledCount = targetDriver.rentTracking?.filter(r => r.status === 'CANCELLED').length;
            console.log(`Cancelled weeks count: ${cancelledCount}`);
        } else {
            console.log(`Target driver ${targetId} not found by exact ID, searching active drivers with cancelled rent tracking...`);
        }

        // Find all ACTIVE drivers with no deactivationDate (or deactivationDate in the future) where rentTracking contains CANCELLED items
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const activeDrivers = await Driver.find({ isDeleted: false });
        let repairedDriversCount = 0;
        let restoredWeeksCount = 0;

        for (const driver of activeDrivers) {
            const deactDate = driver.deactivationDate ? new Date(driver.deactivationDate) : null;
            if (deactDate) deactDate.setHours(23, 59, 59, 999);

            const isDeactivated = deactDate && deactDate <= today;
            if (isDeactivated) continue; // Skip actually deactivated drivers

            let modified = false;
            let restoredForDriver = 0;

            if (Array.isArray(driver.rentTracking)) {
                driver.rentTracking.forEach(item => {
                    const itemDueDate = item.dueDate ? new Date(item.dueDate) : null;
                    if (itemDueDate) itemDueDate.setHours(0, 0, 0, 0);

                    const isPastDeactivation = deactDate && itemDueDate ? itemDueDate > deactDate : false;

                    // If driver is ACTIVE and installment was marked CANCELLED, restore it to PENDING!
                    if (!isDeactivated && !isPastDeactivation && item.status === 'CANCELLED') {
                        item.status = 'PENDING';
                        item.balance = item.amount || 0;
                        modified = true;
                        restoredForDriver++;
                    }
                });
            }

            if (modified) {
                driver.markModified('rentTracking');
                await driver.save();
                repairedDriversCount++;
                restoredWeeksCount += restoredForDriver;
                console.log(`Restored driver ${driver.driverId} (${driver.personalInfo?.fullName}): ${restoredForDriver} week(s) restored to PENDING.`);
            }
        }

        console.log(`\nRepair complete! Repaired ${repairedDriversCount} active driver(s), restored ${restoredWeeksCount} future weekly installment(s) back to PENDING.`);
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

fixActiveDriverRentPlans();
