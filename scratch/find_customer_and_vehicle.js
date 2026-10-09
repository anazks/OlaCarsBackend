const mongoose = require("mongoose");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });
const connectDB = require("../Src/config/dbConfig");

// Import models
const Customer = require("../Src/modules/Customer/Model/CustomerModel");
const { Driver } = require("../Src/modules/Driver/Model/DriverModel");
require("../Src/modules/Fleet/Model/FleetModel");
const { Vehicle } = require("../Src/modules/Vehicle/Model/VehicleModel");

async function main() {
    await connectDB();
    console.log("Connected to DB");

    // 1. Customer
    const customer = await Customer.findById('6a82c8d43f7babe484dc9891').lean();
    console.log("Customer:", {
        _id: customer._id,
        name: customer.name,
        cfVehicleNo: customer.cfVehicleNo,
        cfFleetNo: customer.cfFleetNo,
        cfVehicleModel: customer.cfVehicleModel,
        cfWeeklyRent: customer.cfWeeklyRent,
        cfActiveDate: customer.cfActiveDate,
        cfDeactivationDate: customer.cfDeactivationDate,
        status: customer.status,
        driver: customer.driver
    });

    // 2. Driver
    const driver = await Driver.findById('6a82c8d33f7babe484dc988e').lean();
    console.log("\nDriver assignmentHistory:", driver.assignmentHistory);
    console.log("Driver status:", driver.status, "currentVehicle:", driver.currentVehicle);

    // 3. Search Vehicle EW1726
    const vehicles = await Vehicle.find({
        $or: [
            { "basicDetails.plateNumber": { $regex: /EW1726/i } },
            { "legalDocs.registrationNumber": { $regex: /EW1726/i } },
            { "basicDetails.fleetNumber": { $regex: /EW1726/i } }
        ]
    }).populate("fleet").lean();

    console.log(`\nFound ${vehicles.length} matching vehicle(s):`);
    for (const v of vehicles) {
        console.log({
            _id: v._id,
            plateNumber: v.basicDetails?.plateNumber,
            registrationNumber: v.legalDocs?.registrationNumber,
            make: v.basicDetails?.make,
            model: v.basicDetails?.model,
            fleetNumber: v.basicDetails?.fleetNumber || v.fleet?.fleetNumber,
            status: v.status,
            assignment: v.assignment
        });
    }

    await mongoose.disconnect();
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
