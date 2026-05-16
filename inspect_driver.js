const mongoose = require('mongoose');
const { Driver } = require('./src/modules/Driver/Model/DriverModel');
require('dotenv').config();

const inspectDriver = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        const driver = await Driver.findOne({ 'personalInfo.fullName': /Antonyr Efron/i });
        if (!driver) {
            console.log('Driver not found');
            process.exit(1);
        }

        console.log(`Driver: ${driver.personalInfo.fullName}`);
        console.log(`Status: ${driver.status}`);
        console.log(`Vehicle: ${driver.currentVehicle}`);
        console.log(`Rent Tracking Count: ${driver.rentTracking.length}`);
        
        if (driver.rentTracking.length > 0) {
            const first = driver.rentTracking[0];
            const last = driver.rentTracking[driver.rentTracking.length - 1];
            console.log(`First Week: Wk${first.weekNumber}, Due: ${first.dueDate}`);
            console.log(`Last Week: Wk${last.weekNumber}, Due: ${last.dueDate}`);
            
            const today = new Date();
            const dueLimit = new Date();
            dueLimit.setDate(today.getDate() + 7);
            console.log(`Today: ${today.toISOString()}`);
            console.log(`Due Limit (+7d): ${dueLimit.toISOString()}`);
            
            const nextDue = driver.rentTracking.find(t => t.status !== 'PAID');
            if (nextDue) {
                console.log(`Next Pending Week: Wk${nextDue.weekNumber}, Due: ${nextDue.dueDate.toISOString()}`);
                console.log(`Is Due <= Limit? ${new Date(nextDue.dueDate) <= dueLimit}`);
            }
        }

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

inspectDriver();
