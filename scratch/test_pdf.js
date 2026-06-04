const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

// Pre-register schemas for populate
require("../Src/modules/Driver/Model/DriverModel");
require("../Src/modules/Vehicle/Model/VehicleModel");

const { Invoice } = require("../Src/modules/Invoice/Model/InvoiceModel");
const InvoicePdfService = require("../Src/modules/Invoice/Service/InvoicePdfService");

const testPdf = async () => {
    try {
        console.log("Connecting to MongoDB:", process.env.MONGO_URI);
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Connected successfully!");

        // Find any invoice
        const invoice = await Invoice.findOne({ isDeleted: false })
            .populate("driver")
            .populate("vehicle");

        if (!invoice) {
            console.error("No invoice found in database to test!");
            process.exit(1);
        }

        console.log("Found Invoice ID:", invoice._id);
        console.log("Invoice Number:", invoice.invoiceNumber);
        console.log("Driver details populated:", !!invoice.driver);
        console.log("Vehicle details populated:", !!invoice.vehicle);

        const outPath = path.join(__dirname, "test_invoice.pdf");
        const writeStream = fs.createWriteStream(outPath);

        console.log("Generating PDF...");
        InvoicePdfService.generateInvoicePdf(invoice, writeStream);

        writeStream.on("finish", () => {
            console.log("PDF generation finished successfully!");
            console.log("File saved to:", outPath);
            process.exit(0);
        });

        writeStream.on("error", (err) => {
            console.error("WriteStream Error:", err);
            process.exit(1);
        });

    } catch (err) {
        console.error("PDF Gen Error:", err);
        process.exit(1);
    }
};

testPdf();
