require('dotenv').config();
const mongoose = require('mongoose');
const { generateDueInvoices } = require('../Src/modules/Invoice/Service/InvoiceCronService');

async function test() {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected to DB.");

    console.log("Running generateDueInvoices manually...");
    await generateDueInvoices();
    console.log("Finished running generateDueInvoices.");

    mongoose.disconnect();
}

test();
