require("dotenv").config();
const mongoose = require("mongoose");
const connectDB = require("../Src/config/dbConfig");

// Load Models
const Fleet = require("../Src/modules/Fleet/Model/FleetModel");
const OperationStaff = require("../Src/modules/OperationStaff/Model/OperationStaffModel");
const FinanceStaff = require("../Src/modules/FinanceStaff/Model/FinanceStaffModel");
const { Vehicle } = require("../Src/modules/Vehicle/Model/VehicleModel");

const runMigration = async () => {
    try {
        console.log("Connecting to database...");
        await connectDB();
        console.log("Database connected successfully. Starting migration...");

        // 1. Migrate Staff fleet numbers
        const operationStaffList = await OperationStaff.find({ 
            fleetNumbers: { $exists: true, $ne: [] },
            isDeleted: false 
        });
        const financeStaffList = await FinanceStaff.find({ 
            fleetNumbers: { $exists: true, $ne: [] },
            isDeleted: false 
        });

        console.log(`Found ${operationStaffList.length} Operation Staff with fleet assignments.`);
        console.log(`Found ${financeStaffList.length} Finance Staff with fleet assignments.`);

        let fleetsCreated = 0;
        let fleetsAlreadyExisted = 0;

        const processStaffFleets = async (staffList, modelName) => {
            for (const staff of staffList) {
                console.log(`Processing fleets for ${modelName}: ${staff.fullName} (${staff._id})`);
                for (const fleetNum of staff.fleetNumbers) {
                    if (!fleetNum || fleetNum.trim() === "") continue;

                    const trimmedNum = fleetNum.trim();
                    
                    // Check if fleet already exists
                    let fleetDoc = await Fleet.findOne({ fleetNumber: trimmedNum });
                    if (!fleetDoc) {
                        fleetDoc = await Fleet.create({
                            fleetNumber: trimmedNum,
                            assignedStaff: staff._id,
                            assignedStaffModel: modelName,
                            status: "ACTIVE",
                            description: `Migrated fleet assignment for ${staff.fullName}`
                        });
                        fleetsCreated++;
                        console.log(`  Created Fleet: ${trimmedNum}`);
                    } else {
                        fleetsAlreadyExisted++;
                        // Update assigned staff if it was empty or different
                        if (fleetDoc.assignedStaff?.toString() !== staff._id.toString()) {
                            fleetDoc.assignedStaff = staff._id;
                            fleetDoc.assignedStaffModel = modelName;
                            await fleetDoc.save();
                            console.log(`  Updated Fleet ${trimmedNum} assignment to ${staff.fullName}`);
                        }
                    }
                }
            }
        };

        await processStaffFleets(operationStaffList, "OperationStaff");
        await processStaffFleets(financeStaffList, "FinanceStaff");

        // 2. Link Vehicles to Fleets
        const vehicles = await Vehicle.find({ 
            "basicDetails.fleetNumber": { $exists: true, $ne: "", $ne: null },
            isDeleted: false 
        });

        console.log(`Found ${vehicles.length} vehicles with fleet numbers. Linking them...`);

        let vehiclesLinked = 0;
        let vehicleFleetsNotFound = 0;

        for (const vehicle of vehicles) {
            const fleetNum = vehicle.basicDetails.fleetNumber.trim();
            const fleetDoc = await Fleet.findOne({ fleetNumber: fleetNum });

            if (fleetDoc) {
                vehicle.fleet = fleetDoc._id;
                
                // Sync vehicle's handlingStaff with fleet's assigned staff if handlingStaff is empty
                if (!vehicle.handlingStaff && fleetDoc.assignedStaff) {
                    vehicle.handlingStaff = fleetDoc.assignedStaff;
                }
                
                await vehicle.save();
                vehiclesLinked++;
            } else {
                // If a vehicle had a fleet number but no staff possessed it, create an unassigned fleet
                console.warn(`  Fleet "${fleetNum}" not found in staff assignments for vehicle VIN: ${vehicle.basicDetails?.vin || vehicle._id}. Creating unassigned/admin fleet.`);
                
                // Find a default Admin or just create the Fleet without assignedStaff
                const newFleetDoc = await Fleet.create({
                    fleetNumber: fleetNum,
                    // Leaving assignedStaff empty, but it requires it in validation if creating via API. 
                    // Let's find first admin just to be safe
                    assignedStaff: vehicle.createdBy || mongoose.Types.ObjectId("67b36f78f9f6e02422a101e4"), // fallback dummy ID or creator
                    assignedStaffModel: vehicle.creatorRole === "OperationStaff" ? "OperationStaff" : "FinanceStaff",
                    status: "ACTIVE",
                    description: `Auto-created during migration for vehicle VIN: ${vehicle.basicDetails?.vin}`
                });

                vehicle.fleet = newFleetDoc._id;
                await vehicle.save();
                vehiclesLinked++;
                fleetsCreated++;
            }
        }

        console.log("\nMigration completed successfully!");
        console.log(`- Fleets created: ${fleetsCreated}`);
        console.log(`- Fleets already existed: ${fleetsAlreadyExisted}`);
        console.log(`- Vehicles linked to fleets: ${vehiclesLinked}`);
        
        process.exit(0);
    } catch (error) {
        console.error("Migration failed:", error);
        process.exit(1);
    }
};

runMigration();
