const mongoose = require('mongoose');
require('dotenv').config();
const { Vehicle } = require('../Src/modules/Vehicle/Model/VehicleModel');

const run = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        const agg = await Vehicle.aggregate([
            { $group: { _id: "$status", count: { $sum: 1 } } }
        ]);
        console.log("Vehicle Status Counts in DB:", JSON.stringify(agg, null, 2));
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

run();
