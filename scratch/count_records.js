const mongoose = require('mongoose');
mongoose.set('autoIndex', false);

const Customer = require('../src/modules/Customer/Model/CustomerModel');
const { Driver } = require('../src/modules/Driver/Model/DriverModel');
const { Vehicle } = require('../src/modules/Vehicle/Model/VehicleModel');
require('dotenv').config();

const count = async () => {
    try {
        console.log('Connecting...');
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected! Counting...');
        
        const customerCount = await Customer.countDocuments();
        const driverCount = await Driver.countDocuments();
        const vehicleCount = await Vehicle.countDocuments();
        
        console.log(`Customers: ${customerCount}`);
        console.log(`Drivers: ${driverCount}`);
        console.log(`Vehicles: ${vehicleCount}`);
        
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

count();
