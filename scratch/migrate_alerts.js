const mongoose = require('mongoose');
require('dotenv').config();

const MONGO_URI = process.env.MONGO_URI;

const run = async () => {
    try {
        await mongoose.connect(MONGO_URI);
        console.log("Connected to DB");

        const { Alert } = require('../Src/modules/Alert/Model/AlertModel');
        const { Vehicle } = require('../Src/modules/Vehicle/Model/VehicleModel');
        require('../Src/modules/Branch/Model/BranchModel'); // Ensure Branch model is registered

        const alerts = await Alert.find({ branchId: { $exists: false } });
        console.log(`Found ${alerts.length} alerts to migrate.`);

        for (const alert of alerts) {
            const vehicle = await Vehicle.findById(alert.vehicleId).populate('purchaseDetails.branch');
            if (vehicle && vehicle.purchaseDetails && vehicle.purchaseDetails.branch) {
                alert.branchId = vehicle.purchaseDetails.branch._id || vehicle.purchaseDetails.branch;
                alert.country = vehicle.purchaseDetails.branch.country || "UNKNOWN";
                await alert.save();
                console.log(`Migrated alert ${alert._id} for vehicle ${vehicle._id} (Branch: ${alert.branchId}, Country: ${alert.country})`);
            } else {
                console.warn(`Could not migrate alert ${alert._id}: Vehicle or branch not found.`);
            }
        }

        console.log("Migration complete.");
        process.exit(0);
    } catch (error) {
        console.error("Migration error:", error);
        process.exit(1);
    }
};

run();
