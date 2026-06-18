const mongoose = require('mongoose');
mongoose.set('autoIndex', false);

const Customer = require('../src/modules/Customer/Model/CustomerModel');
const { Driver } = require('../src/modules/Driver/Model/DriverModel');
const { Vehicle } = require('../src/modules/Vehicle/Model/VehicleModel');
require('dotenv').config();

const inspect = async () => {
    try {
        console.log('Connecting to database...');
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected! Querying customers...');
        
        const customers = await Customer.find({ isDeleted: false, driver: { $ne: null } })
            .populate({
                path: 'driver',
                populate: { path: 'currentVehicle' }
            });
            
        console.log(`Found ${customers.length} customers with drivers.`);
        
        let withActiveDateCount = 0;
        customers.slice(0, 15).forEach(c => {
            const driverName = c.driver ? c.driver.personalInfo?.fullName : 'None';
            const vehicleReg = c.driver?.currentVehicle?.legalDocs?.registrationNumber || 'None';
            const weeklyRent = c.driver?.currentVehicle?.basicDetails?.weeklyRent || 0;
            console.log(`Customer: ${c.name} (Driver ID: ${c.driver?.driverId})`);
            console.log(`- Driver Name: ${driverName}`);
            console.log(`- cfActiveDate: ${c.cfActiveDate}`);
            console.log(`- Vehicle Reg: ${vehicleReg}, Weekly Rent: ${weeklyRent}`);
            if (c.cfActiveDate) withActiveDateCount++;
        });
        
        console.log(`Total customers with active dates in sample: ${withActiveDateCount}`);
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

inspect();
