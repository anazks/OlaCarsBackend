/**
 * Find and optionally delete orphan vehicles (vehicles that are not referenced
 * by any active driver's currentVehicle field).
 *
 * Usage:
 *   node scratch/fix_orphan_vehicles.js          # Dry run (list only)
 *   node scratch/fix_orphan_vehicles.js --delete  # Actually delete orphans
 */
require('dotenv').config();
const mongoose = require('mongoose');
const { Vehicle } = require('../Src/modules/Vehicle/Model/VehicleModel');
const { Driver } = require('../Src/modules/Driver/Model/DriverModel');

const DELETE_MODE = process.argv.includes('--delete');

async function main() {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to database.');

    // Get all active vehicles
    const vehicles = await Vehicle.find({ status: "ACTIVE — RENTED" })
        .select('legalDocs.registrationNumber basicDetails.make basicDetails.model status currentDriver createdAt')
        .lean();

    // Get all drivers with their currentVehicle ID
    const drivers = await Driver.find({ status: "ACTIVE" })
        .select('personalInfo.fullName currentVehicle')
        .lean();

    console.log(`Total Active Vehicles in DB: ${vehicles.length}`);
    console.log(`Total Active Drivers in DB: ${drivers.length}`);

    // Set of vehicle IDs referenced by active drivers
    const activeDriverVehicleIds = new Set();
    for (const d of drivers) {
        if (d.currentVehicle) {
            activeDriverVehicleIds.add(d.currentVehicle.toString());
        }
    }

    // Find vehicles not referenced by any active driver
    const orphans = [];
    for (const v of vehicles) {
        if (!activeDriverVehicleIds.has(v._id.toString())) {
            orphans.push(v);
        }
    }

    console.log(`\nFound ${orphans.length} orphan vehicle(s) (not linked to any active driver's currentVehicle):\n`);

    for (const v of orphans) {
        const reg = v.legalDocs?.registrationNumber || 'N/A';
        const make = v.basicDetails?.make || 'N/A';
        const model = v.basicDetails?.model || 'N/A';
        console.log(`  - ${reg} (${make} ${model}) | ID: ${v._id} | currentDriver: ${v.currentDriver || 'none'} | Created: ${v.createdAt}`);
    }

    if (DELETE_MODE && orphans.length > 0) {
        const ids = orphans.map(v => v._id);
        const result = await Vehicle.deleteMany({ _id: { $in: ids } });
        console.log(`\n✅ Deleted ${result.deletedCount} orphan vehicle(s).`);
    } else if (orphans.length > 0) {
        console.log('\n⚠️  Dry run only. Run with --delete to remove these orphan vehicles.');
    }

    await mongoose.disconnect();
}

main().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});
