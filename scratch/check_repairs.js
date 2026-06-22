const mongoose = require('mongoose');
require('dotenv').config();
const { Vehicle } = require('../Src/modules/Vehicle/Model/VehicleModel');

const run = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        const repairs = await Vehicle.find({ status: 'REPAIR IN PROGRESS' }).limit(10).lean();
        console.log("REPAIR IN PROGRESS vehicles (first 10):");
        repairs.forEach((v, idx) => {
            console.log(`\nVehicle #${idx + 1}:`);
            console.log(JSON.stringify(v, null, 2));
        });
        
        const retired = await Vehicle.find({ status: 'RETIRED' }).limit(3).lean();
        console.log("\nRETIRED vehicles (first 3):");
        retired.forEach((v, idx) => {
            console.log(`\nRetired #${idx + 1}:`);
            console.log(JSON.stringify(v, null, 2));
        });

        const pending = await Vehicle.find({ status: 'PENDING ENTRY' }).limit(3).lean();
        console.log("\nPENDING ENTRY vehicles (first 3):");
        pending.forEach((v, idx) => {
            console.log(`\nPending #${idx + 1}:`);
            console.log(JSON.stringify(v, null, 2));
        });
        
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

run();
