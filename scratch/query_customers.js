const mongoose = require("mongoose");
const Customer = require("../Src/modules/Customer/Model/CustomerModel.js");
require("dotenv").config();

async function run() {
    await mongoose.connect(process.env.MONGO_URI);
    const customers = await Customer.find({ isDeleted: false });
    console.log("Total Customers:", customers.length);
    console.log("Sample Customers (first 50):");
    customers.slice(0, 50).forEach((c, i) => {
        console.log(`${i+1}. Name: "${c.name}", customerId: "${c.customerId}", customerNumber: "${c.customerNumber}"`);
    });
    process.exit(0);
}

run().catch(err => {
    console.error(err);
    process.exit(1);
});
