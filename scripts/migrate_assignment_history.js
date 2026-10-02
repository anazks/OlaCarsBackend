/**
 * One-time migration: Backfill assignmentHistory for existing drivers
 * 
 * For each driver that has a currentVehicle or had one (has activationDate/deactivationDate),
 * this script creates an assignmentHistory entry from the existing top-level fields.
 * 
 * Safe to run multiple times — skips drivers that already have assignmentHistory entries.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const { Driver } = require('../Src/modules/Driver/Model/DriverModel');
const { Vehicle } = require('../Src/modules/Vehicle/Model/VehicleModel');

async function migrate() {
    const mongoUri = process.env.MONGO_URI;
    if (!mongoUri) {
        console.error('[ERROR] MONGO_URI not set');
        process.exit(1);
    }

    await mongoose.connect(mongoUri);
    console.log('[CONNECTED] to MongoDB');

    // Find all drivers that might need migration
    const drivers = await Driver.find({
        isDeleted: { $ne: true },
        $or: [
            { currentVehicle: { $ne: null } },
            { activationDate: { $ne: null } },
            { deactivationDate: { $ne: null } },
        ]
    }).lean();

    console.log(`[SCAN] Found ${drivers.length} drivers to check`);

    let migrated = 0;
    let skipped = 0;
    let errors = 0;

    for (const driver of drivers) {
        try {
            // Skip if driver already has non-empty assignmentHistory
            if (driver.assignmentHistory && driver.assignmentHistory.length > 0) {
                skipped++;
                continue;
            }

            // Determine vehicle to reference
            const vehicleId = driver.currentVehicle;
            
            // Try to find vehicle from rentTracking if currentVehicle is null
            let resolvedVehicleId = vehicleId;
            if (!resolvedVehicleId && driver.rentTracking && driver.rentTracking.length > 0) {
                resolvedVehicleId = driver.rentTracking[0].vehicle;
            }

            if (!resolvedVehicleId && !driver.activationDate) {
                // No vehicle reference and no activation date — nothing to migrate
                skipped++;
                continue;
            }

            // Fetch vehicle details for snapshot
            let plateNumber = '';
            let fleetNumber = '';
            let vehicleModel = '';

            if (resolvedVehicleId) {
                const vehicle = await Vehicle.findById(resolvedVehicleId).lean();
                if (vehicle) {
                    plateNumber = vehicle.legalDocs?.registrationNumber || vehicle.basicDetails?.plateNumber || '';
                    fleetNumber = vehicle.basicDetails?.fleetNumber || '';
                    vehicleModel = `${vehicle.basicDetails?.make || ''} ${vehicle.basicDetails?.model || ''}`.trim();
                }
            }

            const startDate = driver.activationDate || driver.createdAt || new Date();
            const endDate = driver.deactivationDate || null;
            const isActive = driver.status === 'ACTIVE' && driver.currentVehicle;
            const status = isActive ? 'ACTIVE' : (endDate ? 'CANCELLED' : 'COMPLETED');

            const assignmentEntry = {
                vehicle: resolvedVehicleId || undefined,
                plateNumber,
                fleetNumber,
                vehicleModel,
                weeklyRent: driver.weeklyRent || undefined,
                startDate,
                endDate,
                status,
            };

            await Driver.findByIdAndUpdate(driver._id, {
                $set: { assignmentHistory: [assignmentEntry] }
            });

            migrated++;
            console.log(`  [OK] ${driver.driverId || driver._id} -> ${plateNumber || 'unknown vehicle'} | ${status} | ${startDate?.toISOString?.()?.split('T')[0] || '?'} -> ${endDate?.toISOString?.()?.split('T')[0] || 'ongoing'}`);
        } catch (err) {
            errors++;
            console.error(`  [ERR] ${driver.driverId || driver._id}: ${err.message}`);
        }
    }

    console.log(`\n[DONE] Migrated: ${migrated} | Skipped: ${skipped} | Errors: ${errors}`);
    await mongoose.connection.close();
    process.exit(0);
}

migrate().catch(err => {
    console.error('[FATAL]', err);
    process.exit(1);
});
