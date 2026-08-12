require('dotenv').config();
const fs = require('fs');
const path = require('path');
const connectDB = require('./Src/config/dbConfig');

// Register models
require('./Src/modules/Branch/Model/BranchModel');
require('./Src/modules/Driver/Model/DriverModel');
const { Vehicle } = require('./Src/modules/Vehicle/Model/VehicleModel');
const gpsService = require('./Src/modules/Gps/Service/GpsService');

async function exportLists() {
    try {
        console.log('Connecting to MongoDB...');
        await connectDB();

        console.log('Fetching all Database Vehicles...');
        const dbVehicles = await Vehicle.find({ isDeleted: false })
            .populate('purchaseDetails.branch')
            .populate('currentDriver', 'personalInfo.fullName personalInfo.phone driverId')
            .lean();

        console.log(`Total Database Vehicles count: ${dbVehicles.length}`);

        console.log('Fetching all GPS Telemetry Devices from Tracksolid...');
        let gpsVehicles = [];
        try {
            gpsVehicles = await gpsService.getVehiclesList();
        } catch (gpsErr) {
            console.error('Error fetching GPS devices from API:', gpsErr.message);
        }
        console.log(`Total GPS Devices count: ${gpsVehicles ? gpsVehicles.length : 0}`);

        const dbFilePath = path.join(__dirname, 'total_db_vehicles.json');
        const gpsFilePath = path.join(__dirname, 'gps_telemetry_vehicles.json');

        fs.writeFileSync(dbFilePath, JSON.stringify(dbVehicles, null, 2));
        fs.writeFileSync(gpsFilePath, JSON.stringify(gpsVehicles || [], null, 2));

        console.log(`Saved Database Vehicles to: ${dbFilePath}`);
        console.log(`Saved GPS Telemetry Vehicles to: ${gpsFilePath}`);

        // Generate matching comparison report
        const matched = [];
        const unmatchedGps = [];
        
        (gpsVehicles || []).forEach(gps => {
            const gpsVin = (gps.carFrame || '').toUpperCase().trim();
            const gpsPlate = (gps.vehicleNumber || '').toUpperCase().trim();

            const match = dbVehicles.find(db => {
                const dbVin = (db.basicDetails?.vin || '').toUpperCase().trim();
                const dbPlate = (db.legalDocs?.registrationNumber || '').toUpperCase().trim();
                const dbFleetNum = (db.basicDetails?.fleetNumber || '').toUpperCase().trim();

                return (
                    (gpsVin && dbVin && gpsVin === dbVin) ||
                    (gpsPlate && dbPlate && gpsPlate === dbPlate) ||
                    (gpsVin && dbPlate && gpsVin === dbPlate) ||
                    (gpsPlate && dbVin && gpsPlate === dbVin) ||
                    (gpsVin && dbFleetNum && gpsVin === dbFleetNum)
                );
            });

            if (match) {
                matched.push({
                    gpsImei: gps.imei,
                    gpsDeviceName: gps.deviceName,
                    gpsPlate: gps.vehicleNumber,
                    gpsVin: gps.carFrame,
                    dbVehicleId: match._id,
                    dbRegistrationNumber: match.legalDocs?.registrationNumber,
                    dbVin: match.basicDetails?.vin,
                    dbMakeModel: `${match.basicDetails?.make || ''} ${match.basicDetails?.model || ''}`.trim(),
                    status: match.status
                });
            } else {
                unmatchedGps.push(gps);
            }
        });

        const summary = {
            totalDbVehiclesCount: dbVehicles.length,
            totalGpsDevicesCount: (gpsVehicles || []).length,
            matchedVehiclesCount: matched.length,
            unmatchedGpsDevicesCount: unmatchedGps.length,
            generatedAt: new Date().toISOString()
        };

        const summaryFilePath = path.join(__dirname, 'vehicles_comparison_summary.json');
        fs.writeFileSync(summaryFilePath, JSON.stringify(summary, null, 2));
        console.log(`Saved Summary to: ${summaryFilePath}`);

        console.log('\n--- SUMMARY ---');
        console.table(summary);

        process.exit(0);
    } catch (err) {
        console.error('Error exporting vehicle lists:', err);
        process.exit(1);
    }
}

exportLists();
