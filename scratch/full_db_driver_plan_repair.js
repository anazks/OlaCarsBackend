const mongoose = require('mongoose');
require('dotenv').config({ path: 'c:/Users/anton/OneDrive/Documents/vs coding/OlaCarsBackend/.env' });

const { Driver } = require('../Src/modules/Driver/Model/DriverModel');
const { Vehicle } = require('../Src/modules/Vehicle/Model/VehicleModel');
const Customer = require('../Src/modules/Customer/Model/CustomerModel');

async function fullDbDriverPlanRepair() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Connected to MongoDB...");

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const drivers = await Driver.find({ isDeleted: false });
        console.log(`Evaluating ${drivers.length} total drivers in DB...\n`);

        let activeRestoredDrivers = 0;
        let activeRestoredWeeks = 0;

        let deactivatedStruckDrivers = 0;
        let deactivatedStruckWeeks = 0;

        let vehiclesReleased = 0;

        for (const driver of drivers) {
            const deactDate = driver.deactivationDate ? new Date(driver.deactivationDate) : null;
            if (deactDate) deactDate.setHours(23, 59, 59, 999);

            const isDeactivated = deactDate && deactDate <= new Date();

            let driverModified = false;
            let restoredCount = 0;
            let struckCount = 0;

            if (isDeactivated) {
                // Ensure driver status is INACTIVE
                if (driver.status !== 'INACTIVE') {
                    driver.status = 'INACTIVE';
                    driverModified = true;
                    await Customer.findOneAndUpdate({ driver: driver._id }, { status: 'INACTIVE' });
                }

                // Safe vehicle unassignment
                if (driver.currentVehicle) {
                    const vehicle = await Vehicle.findById(driver.currentVehicle);
                    if (vehicle && vehicle.currentDriver && vehicle.currentDriver.toString() === driver._id.toString()) {
                        vehicle.currentDriver = null;
                        vehicle.status = 'ACTIVE — AVAILABLE';
                        vehicle.statusHistory.push({
                            status: 'ACTIVE — AVAILABLE',
                            timestamp: new Date(),
                            notes: `Vehicle unassigned during DB repair script for deactivated driver ${driver.personalInfo?.fullName}.`
                        });
                        await vehicle.save();
                        vehiclesReleased++;
                    }
                    driver.currentVehicle = null;
                    driverModified = true;
                }

                // Strike off future weeks for deactivated driver
                if (Array.isArray(driver.rentTracking)) {
                    driver.rentTracking.forEach(item => {
                        const itemDueDate = item.dueDate ? new Date(item.dueDate) : null;
                        if (itemDueDate) itemDueDate.setHours(0, 0, 0, 0);

                        const isPastDeact = deactDate && itemDueDate ? itemDueDate > deactDate : false;

                        if ((isPastDeact || (itemDueDate && itemDueDate > today)) && item.status === 'PENDING') {
                            item.status = 'CANCELLED';
                            item.balance = 0;
                            driverModified = true;
                            struckCount++;
                        }
                    });
                }

                if (struckCount > 0) {
                    deactivatedStruckDrivers++;
                    deactivatedStruckWeeks += struckCount;
                }
            } else {
                // Active driver — ensure future weeks are PENDING and NOT CANCELLED
                if (Array.isArray(driver.rentTracking)) {
                    driver.rentTracking.forEach(item => {
                        const itemDueDate = item.dueDate ? new Date(item.dueDate) : null;
                        if (itemDueDate) itemDueDate.setHours(0, 0, 0, 0);

                        const isPastDeact = deactDate && itemDueDate ? itemDueDate > deactDate : false;

                        if (!isPastDeact && item.status === 'CANCELLED') {
                            item.status = 'PENDING';
                            item.balance = item.amount || 0;
                            driverModified = true;
                            restoredCount++;
                        }
                    });
                }

                if (restoredCount > 0) {
                    activeRestoredDrivers++;
                    activeRestoredWeeks += restoredCount;
                }
            }

            if (driverModified) {
                driver.markModified('rentTracking');
                await driver.save();
            }
        }

        console.log("=========================================");
        console.log("        FULL DB REPAIR SUMMARY           ");
        console.log("=========================================");
        console.log(`Total Drivers Evaluated       : ${drivers.length}`);
        console.log(`Active Drivers Restored       : ${activeRestoredDrivers}`);
        console.log(`Active Weeks Restored to PENDING: ${activeRestoredWeeks}`);
        console.log(`Deactivated Drivers Struck Off: ${deactivatedStruckDrivers}`);
        console.log(`Deactivated Weeks Struck Off  : ${deactivatedStruckWeeks}`);
        console.log(`Vehicles Safely Unassigned    : ${vehiclesReleased}`);
        console.log("=========================================\n");

        process.exit(0);
    } catch (err) {
        console.error("Error during DB repair:", err);
        process.exit(1);
    }
}

fullDbDriverPlanRepair();
