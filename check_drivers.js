const mongoose = require('mongoose');
const { Driver } = require('./src/modules/Driver/Model/DriverModel');
require('dotenv').config();

const checkDrivers = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        const allDrivers = await Driver.find({ isDeleted: false });
        console.log(`Total non-deleted drivers: ${allDrivers.length}`);
        
        const activeDrivers = allDrivers.filter(d => d.status === 'ACTIVE');
        console.log(`Active drivers: ${activeDrivers.length}`);
        
        activeDrivers.forEach(d => {
            console.log(`- ${d.personalInfo.fullName}: Vehicle: ${d.currentVehicle}, Tracking Count: ${d.rentTracking?.length || 0}`);
        });

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

checkDrivers();
