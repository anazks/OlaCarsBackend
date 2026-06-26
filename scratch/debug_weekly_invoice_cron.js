require('dotenv').config({path: '../.env'});
const mongoose = require('mongoose');

// Register all schemas in mongoose
const Branch = require('../Src/modules/Branch/Model/BranchModel');
const Admin = require('../Src/modules/Admin/model/adminModel');
const Customer = require('../Src/modules/Customer/Model/CustomerModel');
const { Driver } = require('../Src/modules/Driver/Model/DriverModel');
const { Vehicle } = require('../Src/modules/Vehicle/Model/VehicleModel');
const { Invoice } = require('../Src/modules/Invoice/Model/InvoiceModel');

async function debugCron() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Connected to MongoDB.");

        const customersCount = await Customer.countDocuments({});
        const driversCount = await Driver.countDocuments({});
        console.log(`Total Customers in DB: ${customersCount}`);
        console.log(`Total Drivers in DB: ${driversCount}`);

        const activeCustomers = await Customer.find({
            status: 'ACTIVE',
            isDeleted: false,
            driver: { $ne: null }
        }).populate({
            path: 'driver',
            populate: [
                { path: 'currentVehicle' },
                { path: 'branch' }
            ]
        });

        console.log(`\nActive Customers linked to a Driver: ${activeCustomers.length}`);

        const stats = {
            total: activeCustomers.length,
            noDriverPopulated: 0,
            driverNotActive: 0,
            driverNoVehicle: 0,
            driverDeleted: 0,
            noRentTracking: 0,
            noNextPeriod: 0,
            futurePeriod: 0,
            alreadyExists: 0,
            success: 0,
            successSample: []
        };

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const dueLimit = new Date(today);
        dueLimit.setDate(today.getDate() + 7);

        for (const customer of activeCustomers) {
            const driver = customer.driver;
            if (!driver) {
                stats.noDriverPopulated++;
                continue;
            }

            if (driver.status !== 'ACTIVE') {
                stats.driverNotActive++;
                continue;
            }

            if (!driver.currentVehicle) {
                stats.driverNoVehicle++;
                continue;
            }

            if (driver.isDeleted) {
                stats.driverDeleted++;
                continue;
            }

            if (!driver.rentTracking || driver.rentTracking.length === 0) {
                stats.noRentTracking++;
                continue;
            }

            const lastInvoice = await Invoice.findOne({ driver: driver._id, isDeleted: false })
                .sort({ weekNumber: -1 });
            
            const tracking = [...driver.rentTracking].sort((a, b) => a.weekNumber - b.weekNumber);
            let nextPeriod;
            if (!lastInvoice) {
                nextPeriod = tracking[0];
            } else {
                const lastIdx = tracking.findIndex(t => t.weekNumber === lastInvoice.weekNumber);
                if (lastIdx === -1) {
                    nextPeriod = tracking.find(t => t.weekNumber > lastInvoice.weekNumber);
                } else {
                    nextPeriod = tracking[lastIdx + 1];
                }
            }

            if (!nextPeriod) {
                stats.noNextPeriod++;
                continue;
            }

            const dueDate = new Date(nextPeriod.dueDate);
            dueDate.setHours(0, 0, 0, 0);

            if (dueDate > dueLimit) {
                stats.futurePeriod++;
                continue;
            }

            const existing = await Invoice.findOne({ 
                driver: driver._id, 
                weekNumber: nextPeriod.weekNumber, 
                isDeleted: false 
            });

            if (existing) {
                stats.alreadyExists++;
                continue;
            }

            stats.success++;
            if (stats.successSample.length < 5) {
                stats.successSample.push({
                    customerName: customer.fullName || customer.name,
                    driverId: driver.driverId,
                    weekNumber: nextPeriod.weekNumber,
                    amount: nextPeriod.amount,
                    dueDate: nextPeriod.dueDate
                });
            }
        }

        console.log("\n--- CRON CLASSIFICATION STATS ---");
        console.log(JSON.stringify(stats, null, 2));

    } catch (e) {
        console.error(e);
    } finally {
        await mongoose.disconnect();
        console.log("\nDisconnected.");
    }
}

debugCron();
