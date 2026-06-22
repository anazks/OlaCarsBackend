const mongoose = require('mongoose');
require('dotenv').config();
const { Vehicle } = require('../Src/modules/Vehicle/Model/VehicleModel');

const run = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        const repairs = await Vehicle.find({ status: 'REPAIR IN PROGRESS' }).lean();
        
        console.log(`Found ${repairs.length} vehicles in REPAIR IN PROGRESS.`);
        
        // Print all unique keys and values of maintenanceDetails and statusHistory notes
        const types = new Set();
        const statusHistories = [];
        
        repairs.forEach(v => {
            if (v.maintenanceDetails) {
                types.add(JSON.stringify(v.maintenanceDetails));
            }
            if (v.statusHistory && v.statusHistory.length > 0) {
                statusHistories.push(v.statusHistory.map(h => h.notes).join(" | "));
            }
        });
        
        console.log("\nUnique maintenanceDetails values:");
        console.log(Array.from(types));
        
        console.log("\nSome statusHistory notes:");
        console.log(statusHistories.slice(0, 10));
        
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

run();
