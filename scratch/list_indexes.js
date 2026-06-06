const mongoose = require('mongoose');
require('dotenv').config();

async function run() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to DB');
        
        const driversIndexes = await mongoose.connection.collection('drivers').indexes();
        console.log('--- Drivers Indexes ---');
        console.log(JSON.stringify(driversIndexes, null, 2));

        const vehiclesIndexes = await mongoose.connection.collection('vehicles').indexes();
        console.log('--- Vehicles Indexes ---');
        console.log(JSON.stringify(vehiclesIndexes, null, 2));

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

run();
