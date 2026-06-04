const mongoose = require("mongoose");
const connectDB = require("../Src/config/dbConfig");
const { Invoice } = require("../Src/modules/Invoice/Model/InvoiceModel");

const run = async () => {
    await connectDB();
    const invoices = await mongoose.model("Invoice").find({ invoiceNumber: /^MAN-/ });
    console.log(`Found ${invoices.length} invoices with MAN- prefix:`);
    for (const inv of invoices) {
        console.log(`- ID: ${inv._id}, Number: ${inv.invoiceNumber}, Type: ${inv.invoiceType}, Status: ${inv.status}, CreatedAt: ${inv.createdAt}`);
    }
    process.exit(0);
};

run().catch(err => {
    console.error(err);
    process.exit(1);
});
