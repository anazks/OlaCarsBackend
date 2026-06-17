const mongoose = require("mongoose");
const dotenv = require("dotenv");
const path = require("path");

dotenv.config({ path: path.join(__dirname, "../.env") });

// Register models
require("../Src/modules/Branch/Model/BranchModel.js");
const { Driver } = require("../Src/modules/Driver/Model/DriverModel");

async function run() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Connected!");

        const drivers = await Driver.find({ isDeleted: false });
        console.log(`\nFound ${drivers.length} drivers:`);
        drivers.forEach(d => {
            console.log(`Driver ID: ${d._id}, Name: ${d.personalInfo?.fullName}, Status: ${d.status}, Vehicle ID: ${d.currentVehicle}`);
        });

    } catch (e) {
        console.error(e);
    } finally {
        await mongoose.connection.close();
    }
}
run();
