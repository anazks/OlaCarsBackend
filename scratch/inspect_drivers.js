require('dotenv').config({path: '../.env'});
const mongoose = require('mongoose');

// Register all schemas in mongoose
const Branch = require('../Src/modules/Branch/Model/BranchModel');
const Admin = require('../Src/modules/Admin/model/adminModel');
const Customer = require('../Src/modules/Customer/Model/CustomerModel');
const { Driver } = require('../Src/modules/Driver/Model/DriverModel');
const { Vehicle } = require('../Src/modules/Vehicle/Model/VehicleModel');
const { Invoice } = require('../Src/modules/Invoice/Model/InvoiceModel');

async function inspect() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Connected to MongoDB.");

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

        console.log(`Active Customers count: ${activeCustomers.length}`);

        let noNextPeriodSamples = [];
        let futurePeriodSamples = [];

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const dueLimit = new Date(today);
        dueLimit.setDate(today.getDate() + 7);

        for (const customer of activeCustomers) {
            const driver = customer.driver;
            if (!driver || driver.status !== 'ACTIVE' || !driver.currentVehicle || driver.isDeleted) {
                continue;
            }
            if (!driver.rentTracking || driver.rentTracking.length === 0) {
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
                if (noNextPeriodSamples.length < 3) {
                    noNextPeriodSamples.push({
                        driverId: driver.driverId,
                        fullName: driver.personalInfo?.fullName,
                        rentTrackingLength: driver.rentTracking.length,
                        lastInvoiceWeek: lastInvoice ? lastInvoice.weekNumber : null,
                        lastInvoiceAmount: lastInvoice ? lastInvoice.totalAmountDue : null,
                        lastInvoiceStatus: lastInvoice ? lastInvoice.status : null,
                        trackingWeeks: tracking.map(t => ({ weekNumber: t.weekNumber, amount: t.amount, status: t.status, dueDate: t.dueDate }))
                    });
                }
                continue;
            }

            const dueDate = new Date(nextPeriod.dueDate);
            dueDate.setHours(0, 0, 0, 0);

            if (dueDate > dueLimit) {
                if (futurePeriodSamples.length < 3) {
                    futurePeriodSamples.push({
                        driverId: driver.driverId,
                        fullName: driver.personalInfo?.fullName,
                        rentTrackingLength: driver.rentTracking.length,
                        lastInvoiceWeek: lastInvoice ? lastInvoice.weekNumber : null,
                        nextPeriodWeek: nextPeriod.weekNumber,
                        nextPeriodDueDate: nextPeriod.dueDate,
                        nextPeriodAmount: nextPeriod.amount,
                        dueLimitDate: dueLimit,
                        trackingWeeks: tracking.slice(0, 5).map(t => ({ weekNumber: t.weekNumber, amount: t.amount, status: t.status, dueDate: t.dueDate }))
                    });
                }
                continue;
            }
        }

        console.log("\n================ NO NEXT PERIOD SAMPLES ================");
        console.log(JSON.stringify(noNextPeriodSamples, null, 2));

        console.log("\n================ FUTURE PERIOD SAMPLES ================");
        console.log(JSON.stringify(futurePeriodSamples, null, 2));

    } catch (e) {
        console.error(e);
    } finally {
        await mongoose.disconnect();
        console.log("\nDisconnected.");
    }
}

inspect();
