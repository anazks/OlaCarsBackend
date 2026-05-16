const mongoose = require('mongoose');
const { Driver } = require('./src/modules/Driver/Model/DriverModel');
const { Invoice } = require('./src/modules/Invoice/Model/InvoiceModel');
const { Vehicle } = require('./src/modules/Vehicle/Model/VehicleModel');
const SystemSettings = require('./src/modules/SystemSettings/Model/SystemSettingsModel');
require('dotenv').config();

const testGeneration = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected');

        const activeDrivers = await Driver.find({
            status: 'ACTIVE',
            isDeleted: false,
            currentVehicle: { $ne: null }
        }).populate('currentVehicle');

        console.log(`Found ${activeDrivers.length} drivers`);

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const dueLimit = new Date(today);
        dueLimit.setDate(today.getDate() + 7);

        let generated = 0;
        let skipped = 0;

        for (const driver of activeDrivers) {
            console.log(`Processing ${driver.personalInfo.fullName} (${driver.driverId})`);
            
            if (!driver.rentTracking || driver.rentTracking.length === 0) {
                console.log('No rent tracking');
                skipped++;
                continue;
            }

            const lastInvoice = await Invoice.findOne({ driver: driver._id, isDeleted: false })
                .sort({ weekNumber: -1 });
            
            console.log(`Last Invoice Week: ${lastInvoice ? lastInvoice.weekNumber : 'None'}`);

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
                console.log('No next period');
                skipped++;
                continue;
            }

            console.log(`Next Period: Wk${nextPeriod.weekNumber}, Due: ${nextPeriod.dueDate}`);
            
            const dueDate = new Date(nextPeriod.dueDate);
            if (dueDate > dueLimit) {
                console.log(`Too far in future: ${dueDate.toISOString()} > ${dueLimit.toISOString()}`);
                skipped++;
                continue;
            }

            const existing = await Invoice.findOne({ 
                driver: driver._id, 
                weekNumber: nextPeriod.weekNumber, 
                isDeleted: false 
            });
            if (existing) {
                console.log('Already exists');
                skipped++;
                continue;
            }

            console.log('READY TO GENERATE');
            generated++;
        }

        console.log(`Total: ${generated} generated, ${skipped} skipped`);
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

testGeneration();
