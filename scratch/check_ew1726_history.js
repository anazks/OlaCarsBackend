const mongoose = require("mongoose");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });
const connectDB = require("../Src/config/dbConfig");

const Customer = require("../Src/modules/Customer/Model/CustomerModel");
const { Driver } = require("../Src/modules/Driver/Model/DriverModel");

async function main() {
    await connectDB();
    const drivers = await Driver.find({
        $or: [
            { "assignmentHistory.plateNumber": "EW1726" },
            { "assignmentHistory.vehicle": "6a28214ac3bc99646284878d" },
            { currentVehicle: "6a28214ac3bc99646284878d" }
        ]
    }).lean();

    console.log("Drivers with EW1726:", drivers.map(d => ({
        driverId: d.driverId,
        name: d.personalInfo?.fullName,
        history: d.assignmentHistory
    })));

    const customers = await Customer.find({
        $or: [
            { cfVehicleNo: "EW1726" },
            { name: { $regex: /EW1726/i } }
        ]
    }).lean();

    console.log("Customers with EW1726:", customers.map(c => ({
        name: c.name,
        cfVehicleNo: c.cfVehicleNo,
        cfFleetNo: c.cfFleetNo,
        cfVehicleModel: c.cfVehicleModel
    })));

    await mongoose.disconnect();
}

main().catch(console.error);
