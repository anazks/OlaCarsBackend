require('dotenv').config();
const mongoose = require('mongoose');
const { Invoice } = require('../Src/modules/Invoice/Model/InvoiceModel');

async function run() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Connected to MongoDB.");

        const lastInvoice = await Invoice.findOne({ 
            invoiceNumber: /^INV-\d{6}$/ 
        }).sort({ invoiceNumber: -1 });

        console.log("Last invoice found by pattern:", lastInvoice ? {
            _id: lastInvoice._id,
            invoiceNumber: lastInvoice.invoiceNumber,
            createdAt: lastInvoice.createdAt
        } : "NONE");

        // Check if INV-203221 or higher exists
        const match = await Invoice.findOne({ invoiceNumber: "INV-203221" });
        console.log("Does INV-203221 exist?", match ? {
            _id: match._id,
            invoiceNumber: match.invoiceNumber,
            createdAt: match.createdAt
        } : "NO");

        // Find the 10 highest invoice numbers alphabetically
        const highestInvoices = await Invoice.find({
            invoiceNumber: /^INV-\d{6}$/
        }).sort({ invoiceNumber: -1 }).limit(10);

        console.log("\nTop 10 highest matching invoices:");
        highestInvoices.forEach(inv => {
            console.log(`  - ${inv.invoiceNumber} | Created: ${inv.createdAt}`);
        });

    } catch (e) {
        console.error(e);
    } finally {
        await mongoose.disconnect();
    }
}

run();
