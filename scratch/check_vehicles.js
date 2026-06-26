const mongoose = require('mongoose');
mongoose.set('autoIndex', false);

const { Vehicle } = require('../src/modules/Vehicle/Model/VehicleModel');
require('dotenv').config();

const run = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        const vehicles = await Vehicle.find({ status: 'ACTIVE — RENTED' }).limit(10);
        console.log(`Found ${vehicles.length} active rented vehicles.`);
        vehicles.forEach(v => {
            console.log(`- Reg: ${v.legalDocs?.registrationNumber}, Rent: ${v.basicDetails?.weeklyRent}, Status: ${v.status}`);
        });
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

run();
