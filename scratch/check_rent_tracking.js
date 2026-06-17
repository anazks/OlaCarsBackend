const mongoose = require('mongoose');
mongoose.set('autoIndex', false);

const { Driver } = require('../src/modules/Driver/Model/DriverModel');
require('dotenv').config();

const run = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        const drivers = await Driver.find({ isDeleted: false, status: 'ACTIVE' });
        console.log(`Active Drivers: ${drivers.length}`);
        
        let populatedCount = 0;
        drivers.forEach(d => {
            const trackingCount = d.rentTracking ? d.rentTracking.length : 0;
            if (trackingCount > 0) {
                populatedCount++;
                console.log(`- ${d.personalInfo?.fullName || 'N/A'}: ${trackingCount} installments`);
            }
        });
        
        console.log(`Total active drivers with populated tracking: ${populatedCount}`);
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

run();
