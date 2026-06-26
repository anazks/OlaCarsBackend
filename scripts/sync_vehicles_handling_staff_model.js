require("dotenv").config();
const mongoose = require("mongoose");
const connectDB = require("../Src/config/dbConfig");

// Load Models
const Fleet = require("../Src/modules/Fleet/Model/FleetModel");
const { Vehicle } = require("../Src/modules/Vehicle/Model/VehicleModel");

const runSync = async () => {
    try {
        console.log("Connecting to database...");
        await connectDB();
        console.log("Database connected successfully. Starting sync...");

        const vehicles = await Vehicle.find({ isDeleted: false });
        console.log(`Found ${vehicles.length} active vehicles to check/sync.`);

        let syncedCount = 0;
        let clearedCount = 0;

        for (const vehicle of vehicles) {
            if (vehicle.fleet) {
                const fleetDoc = await Fleet.findById(vehicle.fleet);
                if (fleetDoc) {
                    vehicle.basicDetails.fleetNumber = fleetDoc.fleetNumber;
                    vehicle.handlingStaff = fleetDoc.assignedStaff;
                    vehicle.handlingStaffModel = fleetDoc.assignedStaffModel;
                    
                    // Bypass hooks to directly save the exact fields
                    await Vehicle.updateOne(
                        { _id: vehicle._id },
                        { 
                            $set: { 
                                "basicDetails.fleetNumber": fleetDoc.fleetNumber,
                                handlingStaff: fleetDoc.assignedStaff,
                                handlingStaffModel: fleetDoc.assignedStaffModel
                            } 
                        }
                    );
                    syncedCount++;
                    console.log(`[SYNCED] Vehicle ${vehicle.basicDetails?.make} ${vehicle.basicDetails?.model} (VIN: ${vehicle.basicDetails?.vin || 'N/A'}) linked to Fleet #${fleetDoc.fleetNumber} with Staff Model: ${fleetDoc.assignedStaffModel}`);
                } else {
                    // Fleet ID was invalid or deleted, clear the fields
                    await Vehicle.updateOne(
                        { _id: vehicle._id },
                        { 
                            $unset: { fleet: 1, handlingStaff: 1, handlingStaffModel: 1 },
                            $set: { "basicDetails.fleetNumber": "" }
                        }
                    );
                    clearedCount++;
                    console.log(`[CLEARED] Vehicle ${vehicle.basicDetails?.make} (VIN: ${vehicle.basicDetails?.vin || 'N/A'}) - Fleet document not found, cleared associations.`);
                }
            } else {
                // If there is no fleet ID but a fleetNumber existed, try to find the fleet by fleetNumber
                const fleetNum = vehicle.basicDetails?.fleetNumber;
                if (fleetNum && fleetNum.trim() !== "") {
                    const fleetDoc = await Fleet.findOne({ fleetNumber: fleetNum.trim(), isDeleted: false });
                    if (fleetDoc) {
                        await Vehicle.updateOne(
                            { _id: vehicle._id },
                            { 
                                $set: { 
                                    fleet: fleetDoc._id,
                                    "basicDetails.fleetNumber": fleetDoc.fleetNumber,
                                    handlingStaff: fleetDoc.assignedStaff,
                                    handlingStaffModel: fleetDoc.assignedStaffModel
                                } 
                            }
                        );
                        syncedCount++;
                        console.log(`[RESOLVED & SYNCED] Vehicle ${vehicle.basicDetails?.make} associated to Fleet #${fleetDoc.fleetNumber} by name.`);
                    } else {
                        await Vehicle.updateOne(
                            { _id: vehicle._id },
                            { 
                                $unset: { fleet: 1, handlingStaff: 1, handlingStaffModel: 1 },
                                $set: { "basicDetails.fleetNumber": "" }
                            }
                        );
                        clearedCount++;
                        console.log(`[CLEARED] Vehicle ${vehicle.basicDetails?.make} - No matching Fleet found for "${fleetNum}", cleared.`);
                    }
                }
            }
        }

        console.log("\nSync execution completed successfully!");
        console.log(`- Synced / Updated: ${syncedCount} vehicles`);
        console.log(`- Cleared old assignments: ${clearedCount} vehicles`);
        
        process.exit(0);
    } catch (error) {
        console.error("Sync failed:", error);
        process.exit(1);
    }
};

runSync();
