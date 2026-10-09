const mongoose = require("mongoose");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });
const connectDB = require("../Src/config/dbConfig");

const Customer = require("../Src/modules/Customer/Model/CustomerModel");
const { Driver } = require("../Src/modules/Driver/Model/DriverModel");

async function main() {
    await connectDB();
    const customer = await Customer.findById('6a82c8d43f7babe484dc9891').lean();
    console.log("Customer:", customer);

    const driver = await Driver.findById('6a82c8d33f7babe484dc988e').lean();
    console.log("Driver top-level dates & fields:", {
        driverId: driver.driverId,
        status: driver.status,
        activationDate: driver.activationDate,
        deactivationDate: driver.deactivationDate,
        weeklyRent: driver.weeklyRent,
        currentVehicle: driver.currentVehicle,
        assignmentHistory: driver.assignmentHistory
    });

    await mongoose.disconnect();
}

main().catch(console.error);
