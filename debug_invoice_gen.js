const mongoose = require('mongoose');
const { Driver } = require('./src/modules/Driver/Model/DriverModel');
const { Invoice } = require('./src/modules/Invoice/Model/InvoiceModel');
require('dotenv').config();

const debugGenerate = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB');

        const activeDrivers = await Driver.find({
            status: 'ACTIVE',
            isDeleted: false,
            currentVehicle: { $ne: null },
            rentTracking: { $exists: true, $not: { $size: 0 } }
        });

        console.log(`Found ${activeDrivers.length} active drivers matching criteria.`);

        for (const driver of activeDrivers) {
            console.log(`Driver: ${driver.personalInfo.fullName} (${driver._id})`);
            console.log(`Rent Tracking Count: ${driver.rentTracking.length}`);
            
            const lastInvoice = await Invoice.findOne({ driver: driver._id, isDeleted: false })
                .sort({ weekNumber: -1 });
            
            console.log(`Last Invoice Week: ${lastInvoice ? lastInvoice.weekNumber : 'None'}`);

            const tracking = [...driver.rentTracking].sort((a, b) => a.weekNumber - b.weekNumber);
            let nextPeriodIndex = 0;
            if (lastInvoice) {
                nextPeriodIndex = tracking.findIndex(t => t.weekNumber === lastInvoice.weekNumber) + 1;
            }
            
            console.log(`Next Period Index: ${nextPeriodIndex}`);
            if (nextPeriodIndex < tracking.length) {
                const nextPeriod = tracking[nextPeriodIndex];
                console.log(`Next Period Week: ${nextPeriod.weekNumber}`);
                
                const existing = await Invoice.findOne({ 
                    driver: driver._id, 
                    weekNumber: nextPeriod.weekNumber, 
                    isDeleted: false 
                });
                console.log(`Existing Invoice for this week: ${!!existing}`);
            } else {
                console.log('No more periods in rent tracking.');
            }
            console.log('---');
        }

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

debugGenerate();
