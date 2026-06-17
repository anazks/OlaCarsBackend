const mongoose = require('mongoose');
mongoose.set('autoIndex', false);

const { Vehicle } = require('../src/modules/Vehicle/Model/VehicleModel');
require('dotenv').config();

const run = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        const count = await Vehicle.find({ 'basicDetails.weeklyRent': { $gt: 0 } }).countDocuments();
        console.log(`Vehicles with weekly rent > 0: ${count}`);
        
        if (count > 0) {
            const v = await Vehicle.findOne({ 'basicDetails.weeklyRent': { $gt: 0 } });
            console.log(`Sample: Reg: ${v.legalDocs?.registrationNumber}, Rent: ${v.basicDetails?.weeklyRent}`);
        }
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

run();
