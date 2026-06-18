const mongoose = require("mongoose");
const dotenv = require("dotenv");
const path = require("path");

dotenv.config({ path: path.join(__dirname, "../.env") });

// Register models
require("../Src/modules/Branch/Model/BranchModel.js");
const { Vehicle } = require("../Src/modules/Vehicle/Model/VehicleModel");
const { Driver } = require("../Src/modules/Driver/Model/DriverModel");

async function run() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Connected!");

        const vehicles = await Vehicle.find({}).populate("currentDriver");
        console.log(`Total vehicles: ${vehicles.length}`);
        
        vehicles.forEach(v => {
            const driverInfo = v.currentDriver 
                ? `Driver ID: ${v.currentDriver._id}, Name: ${v.currentDriver.personalInfo?.fullName}` 
                : "No Driver Assigned";
            console.log(`Vehicle ID: ${v._id}, Plate: ${v.legalDocs?.registrationNumber || 'N/A'}, Driver: ${driverInfo}`);
        });

    } catch (e) {
        console.error(e);
    } finally {
        await mongoose.connection.close();
    }
}
run();
