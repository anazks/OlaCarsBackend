const mongoose = require("mongoose");
const dotenv = require("dotenv");
const path = require("path");

dotenv.config({ path: path.join(__dirname, "../.env") });

// Register dependencies
require("../Src/modules/Branch/Model/BranchModel.js");
const { getDriversService } = require("../Src/modules/Driver/Repo/DriverRepo");

async function run() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Connected!");

        const unassignedVehicleId = "6a282136c3bc99646284829f"; // dummy id
        console.log(`\nQuerying for unassigned vehicle ID: ${unassignedVehicleId}`);
        const result = await getDriversService({ currentVehicle: unassignedVehicleId, limit: 1 }, {});
        console.log(`Found ${result.data.length} drivers.`);
        if (result.data.length > 0) {
            console.log("Returned Driver ID:", result.data[0]._id);
            console.log("Returned Driver Name:", result.data[0].personalInfo?.fullName);
            console.log("Returned Driver currentVehicle:", result.data[0].currentVehicle);
        } else {
            console.log("Correct: No driver returned for unassigned vehicle.");
        }

    } catch (e) {
        console.error(e);
    } finally {
        await mongoose.connection.close();
    }
}
run();
