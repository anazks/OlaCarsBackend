const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

require("../Src/modules/Driver/Model/DriverModel");
require("../Src/modules/Vehicle/Model/VehicleModel");

const { Invoice } = require("../Src/modules/Invoice/Model/InvoiceModel");
const InvoicePdfService = require("../Src/modules/Invoice/Service/InvoicePdfService");

const testAllPdfs = async () => {
    try {
        console.log("Connecting to MongoDB...");
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Connected successfully!");

        const invoices = await Invoice.find({ isDeleted: false })
            .populate("driver")
            .populate("vehicle");

        console.log(`Found ${invoices.length} invoices to test.`);

        let errorCount = 0;
        for (const invoice of invoices) {
            try {
                // Generate PDF in memory (using a dev null or just dummy write stream)
                const dummyStream = new (require("stream").Writable)({
                    write(chunk, encoding, callback) {
                        callback();
                    }
                });

                InvoicePdfService.generateInvoicePdf(invoice, dummyStream);
                // Wait for the stream to finish if needed, but pdfkit is synchronous in adding content
            } catch (err) {
                console.error(`Error generating PDF for Invoice ID: ${invoice._id}, Number: ${invoice.invoiceNumber}`);
                console.error(err);
                errorCount++;
            }
        }

        console.log(`Test completed. Total errors: ${errorCount}`);
        process.exit(errorCount > 0 ? 1 : 0);

    } catch (err) {
        console.error("Database connection or query error:", err);
        process.exit(1);
    }
};

testAllPdfs();
