require("dotenv").config();
const mongoose = require("mongoose");
const { Invoice } = require("../Src/modules/Invoice/Model/InvoiceModel");
const Customer = require("../Src/modules/Customer/Model/CustomerModel");

async function check() {
    await mongoose.connect(process.env.MONGO_URI);
    const cust = await Customer.findById('6a7d8d08d3daf44b70ef87ae');
    console.log("Customer found:", cust);
    const invoice = await Invoice.findOne({ customer: cust._id });
    console.log("Invoice in DB:", invoice);
    await mongoose.disconnect();
}

check().catch(console.error);
