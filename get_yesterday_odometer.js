require('dotenv').config();
const connectDB = require('./Src/config/dbConfig');
const gpsService = require('./Src/modules/Gps/Service/GpsService');

function getYesterdayDateRange() {
    const now = new Date();
    // Yesterday
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);

    const pad = (n) => String(n).padStart(2, '0');
    const year = yesterday.getFullYear();
    const month = pad(yesterday.getMonth() + 1);
    const day = pad(yesterday.getDate());

    const startTime = `${year}-${month}-${day} 00:00:00`;
    const endTime = `${year}-${month}-${day} 23:59:59`;

    return { dateStr: `${year}-${month}-${day}`, startTime, endTime };
}

async function run() {
    try {
        const inputQuery = process.argv[2] && process.argv[2].trim() !== '' ? process.argv[2].trim() : 'EV0420';
        
        console.log('Connecting to MongoDB (for vehicle/driver context)...');
        try {
            await connectDB();
        } catch (dbErr) {
            console.warn('MongoDB connection warning:', dbErr.message);
        }

        const { dateStr, startTime, endTime } = getYesterdayDateRange();
        console.log(`\n=============================================================`);
        console.log(`  GPS VEHICLE ODOMETER END REPORT FOR YESTERDAY (${dateStr})`);
        console.log(`  Time Period: ${startTime} to ${endTime}`);
        if (inputQuery) {
            console.log(`  Search Query: ${inputQuery}`);
        }
        console.log(`=============================================================\n`);

        console.log('Fetching devices list from Tracksolid...');
        let targetImei = inputQuery;
        
        if (inputQuery && inputQuery !== 'ALL') {
            try {
                const vehicles = await gpsService.getVehiclesList();
                const searchLower = inputQuery.toLowerCase();
                const matchedVehicles = (vehicles || []).filter(v => 
                    (v.imei && String(v.imei).toLowerCase().includes(searchLower)) ||
                    (v.deviceName && String(v.deviceName).toLowerCase().includes(searchLower)) ||
                    (v.vehicleName && String(v.vehicleName).toLowerCase().includes(searchLower)) ||
                    (v.vehicleNumber && String(v.vehicleNumber).toLowerCase().includes(searchLower)) ||
                    (v.carFrame && String(v.carFrame).toLowerCase().includes(searchLower))
                );

                if (matchedVehicles.length > 0) {
                    targetImei = matchedVehicles.map(v => v.imei).join(',');
                    console.log(`Found ${matchedVehicles.length} matching device(s) for "${inputQuery}":`);
                    matchedVehicles.forEach(v => {
                        console.log(` - IMEI: ${v.imei} | Device Name: ${v.deviceName} | Vehicle: ${v.vehicleNumber || v.vehicleName}`);
                    });
                } else {
                    console.log(`No direct device list match for "${inputQuery}". Proceeding with IMEI query: ${inputQuery}`);
                }
            } catch (listErr) {
                console.warn('Could not fetch full device list to resolve name, querying directly:', listErr.message);
            }
        }

        console.log('\nFetching Fleet Summary Data from Tracksolid GPS Service...');
        const report = await gpsService.getFleetSummaryReport({
            imeis: targetImei || 'ALL',
            startTime,
            endTime
        });

        const rows = report.summaryRows || [];

        if (rows.length === 0) {
            console.log(`No GPS devices or trip records found for yesterday for query "${inputQuery}".`);
            process.exit(0);
        }

        const formattedOutput = rows.map(r => ({
            'IMEI': r.imei,
            'Vehicle / Device': r.vehicleNumber || r.device,
            'Driver': r.driverName || 'Unassigned',
            'Trips': r.tripCount,
            'Distance (km)': r.distance,
            'Odometer Start (km)': r.odometerStart,
            'Odometer End (km)': r.odometerEnd,
            'Max Speed (km/h)': r.maxSpeed,
            'Engine Hours': r.engineHoursFormatted
        }));

        console.log('\n--- VEHICLE ODOMETER SUMMARY (YESTERDAY) ---');
        console.table(formattedOutput);

        console.log('\n--- DETAILED ODOMETER END LIST ---');
        rows.forEach((r, idx) => {
            console.log(`\n[${idx + 1}] IMEI: ${r.imei}`);
            console.log(`    Device / Vehicle : ${r.vehicleNumber} (${r.device})`);
            console.log(`    Driver           : ${r.driverName}`);
            console.log(`    Trips Count      : ${r.tripCount}`);
            console.log(`    Distance Traveled: ${r.distance} km`);
            console.log(`    Odometer Start   : ${r.odometerStart} km`);
            console.log(`    Odometer End     : ${r.odometerEnd} km`);
            console.log(`    Engine Hours     : ${r.engineHoursFormatted}`);
        });

        console.log('\n-------------------------------------------------------------');
        console.log(`Total Vehicles Queried: ${report.totals.totalDevices}`);
        console.log(`Total Distance        : ${report.totals.totalDistance} km`);
        console.log(`Total Engine Hours    : ${report.totals.totalEngineHoursFormatted}`);
        console.log('-------------------------------------------------------------\n');

        process.exit(0);
    } catch (err) {
        console.error('Error fetching yesterday odometer data:', err);
        process.exit(1);
    }
}

run();
