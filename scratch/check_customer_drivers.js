const mongoose = require("mongoose");
// Register Driver model
require("../Src/modules/Driver/Model/DriverModel.js");
const Customer = require("../Src/modules/Customer/Model/CustomerModel.js");
require("dotenv").config();

async function run() {
    await mongoose.connect(process.env.MONGO_URI);
    const customers = await Customer.find({ isDeleted: false }).populate("driver");
    console.log("Total Customers:", customers.length);
    const withDriver = customers.filter(c => c.driver);
    console.log("Customers with driver link:", withDriver.length);
    console.log("Sample Customers with driver link (first 10):");
    withDriver.slice(0, 10).forEach((c, i) => {
        console.log(`${i+1}. Customer: "${c.name}" (ID: ${c.customerId}) -> Driver: "${c.driver.personalInfo?.fullName}" (ID: ${c.driver.driverId})`);
    });
    process.exit(0);
}

run().catch(err => {
    console.error(err);
    process.exit(1);
});
