const GpsService = require('./Src/modules/Gps/Service/GpsService');
require('dotenv').config();

async function run() {
    try {
        console.log("Fetching devices from Tracksolid...");
        const devices = await GpsService.getVehiclesList();
        console.log(`Found ${devices.length} devices.`);
        console.log("Devices list:");
        console.log(JSON.stringify(devices, null, 2));
    } catch (err) {
        console.error("Error:", err.message);
    }
    process.exit(0);
}

run();
