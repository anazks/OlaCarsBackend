const mongoose = require("mongoose");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });
const { Invoice } = require("../Src/modules/Invoice/Model/InvoiceModel");

async function run() {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected to MongoDB.");

    const invoices = await Invoice.find({ invoiceNumber: /^INV-182/i, isDeleted: false }).limit(10).select('invoiceNumber generatedAt dueDate').lean();
    console.log("Found invoices starting with INV-182 in DB:", invoices);

    await mongoose.disconnect();
}
run().catch(console.error);
