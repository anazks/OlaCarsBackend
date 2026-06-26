const mongoose = require('mongoose');
require('dotenv').config();
const { Vehicle } = require('../Src/modules/Vehicle/Model/VehicleModel');

const run = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        const vehicles = await Vehicle.find({}).lean();
        
        const counts = {};
        vehicles.forEach(v => {
            const status = v.status || "UNKNOWN";
            const cond = v.basicDetails?.condition || "UNKNOWN";
            const maintType = v.maintenanceDetails?.type || "UNKNOWN";
            const key = `Status: ${status} | Cond: ${cond} | Maint: ${maintType}`;
            counts[key] = (counts[key] || 0) + 1;
        });
        
        console.log("Combination counts:");
        console.log(JSON.stringify(counts, null, 2));
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

run();
