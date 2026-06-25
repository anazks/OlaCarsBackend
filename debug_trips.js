const dotenv = require('dotenv');
dotenv.config();

const GpsService = require('./Src/modules/Gps/Service/GpsService');

(async () => {
    try {
        console.log("Testing token request...");
        const token = await GpsService.getAccessToken();
        console.log("Token retrieved:", token);

        console.log("\nTesting getTripsReport...");
        // Use a default active IMEI or one requested by the user
        const result = await GpsService.getTripsReport('860121060485136', '2026-06-22 16:39:15', '2026-06-23 16:39:15');
        console.log("Result:", result);
    } catch (e) {
        console.error("Error caught:", e.message || e);
    }
})();
