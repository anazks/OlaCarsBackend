const GpsService = require('./Src/modules/Gps/Service/GpsService');
require('dotenv').config();

async function run() {
    try {
        console.log("Fetching devices from Tracksolid...");
        const devices = await GpsService.getVehiclesList();
        console.log(`Found ${devices.length} devices.`);
        
        if (devices.length > 0) {
            const testImei = devices[0].imei;
            console.log(`Testing OBD data for IMEI: ${testImei}...`);
            
            const now = new Date();
            const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            const formatDate = (date) => {
                const pad = (n) => String(n).padStart(2, "0");
                return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
            };
            
            const startTime = formatDate(startOfToday);
            const endTime = formatDate(now);
            
            try {
                const obdData = await GpsService.getObdData(testImei, startTime, endTime);
                console.log("OBD API response success:", JSON.stringify(obdData, null, 2));
            } catch (obdErr) {
                console.error("OBD API call threw error:", obdErr.message);
            }
        } else {
            console.log("No devices found to test OBD query.");
        }
    } catch (err) {
        console.error("General Error:", err.message);
    }
    process.exit(0);
}

run();
