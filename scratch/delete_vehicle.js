const mongoose = require('mongoose');
const { Vehicle } = require('../Src/modules/Vehicle/Model/VehicleModel');
const { Driver } = require('../Src/modules/Driver/Model/DriverModel');
require('dotenv').config();

const VEHICLE_ID = '6a2008565b99b64fe1d92c4c';

async function main() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to database.');

        // 1. Find the vehicle
        const vehicle = await Vehicle.findById(VEHICLE_ID);
        if (!vehicle) {
            console.log(`❌ Vehicle with ID ${VEHICLE_ID} not found.`);
            process.exit(0);
        }

        console.log('\n--- Vehicle Found ---');
        console.log(`ID: ${vehicle._id}`);
        console.log(`Status: ${vehicle.status}`);
        console.log(`Reg Number: ${vehicle.legalDocs?.registrationNumber}`);
        console.log(`Make/Model: ${vehicle.basicDetails?.make} ${vehicle.basicDetails?.model}`);
        console.log(`VIN: ${vehicle.basicDetails?.vin}`);
        console.log(`Is Deleted Field: ${vehicle.isDeleted}`);
        console.log(`Current Driver: ${vehicle.currentDriver}`);
        console.log('---------------------\n');

        // 2. Check for Driver references
        const drivers = await Driver.find({ currentVehicle: VEHICLE_ID });
        if (drivers.length > 0) {
            console.log(`⚠️ Warning: This vehicle is referenced by the following drivers as currentVehicle:`);
            drivers.forEach(d => {
                console.log(`  - Driver: ${d.personalInfo?.fullName} (ID: ${d._id}, Status: ${d.status})`);
            });
        } else {
            console.log(`✅ No drivers referencing this vehicle as currentVehicle.`);
        }

        // We will inspect other models if they exist and require check:
        // E.g., WorkOrder, Insurance, Agreement, Lease, AccidentReport
        // Let's dynamically find models in mongoose that reference this vehicle ID
        const models = mongoose.modelNames();
        console.log(`Checking mongoose models for references to ${VEHICLE_ID}...`);
        
        for (const modelName of models) {
            const model = mongoose.model(modelName);
            // We can search for fields matching VEHICLE_ID
            try {
                // Let's do a general search in the collection for the ID
                // Note: we can search the raw document for references
                // But a simple countDocuments where any key contains the ID might be too slow.
                // We'll inspect fields that we know might contain it: 'vehicle', 'vehicleId', 'currentVehicle' etc.
                const paths = Object.keys(model.schema.paths);
                const query = {};
                const refPaths = paths.filter(p => {
                    const options = model.schema.paths[p].options;
                    return options && (options.ref === 'Vehicle' || options.refPath === 'vehicleRole');
                });
                
                if (refPaths.length > 0) {
                    const orConditions = refPaths.map(p => ({ [p]: VEHICLE_ID }));
                    const count = await model.countDocuments({ $or: orConditions });
                    if (count > 0) {
                        console.log(`  - Found ${count} reference(s) in model "${modelName}" at paths: ${refPaths.join(', ')}`);
                    }
                }
            } catch (err) {
                // Ignore schema issues for specific models
            }
        }

        // 3. Perform hard delete
        console.log('\nPerforming deletion of the vehicle...');
        const result = await Vehicle.deleteOne({ _id: VEHICLE_ID });
        console.log(`✅ Deletion result:`, result);

        // 4. Clean up any Driver currentVehicle references if they exist
        if (drivers.length > 0) {
            console.log('Updating drivers to clear their currentVehicle assignment...');
            const updateResult = await Driver.updateMany(
                { currentVehicle: VEHICLE_ID },
                { $unset: { currentVehicle: "" } }
            );
            console.log(`✅ Drivers update result:`, updateResult);
        }

        await mongoose.disconnect();
        console.log('Disconnected from database.');
    } catch (err) {
        console.error('Error during execution:', err);
        process.exit(1);
    }
}

main();
