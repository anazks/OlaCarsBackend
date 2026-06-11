const mongoose = require("mongoose");
const dotenv = require("dotenv");
const path = require("path");
const fs = require("fs");

// Load backend env
dotenv.config({ path: path.join(__dirname, "../.env") });

const { Invoice } = require("../Src/modules/Invoice/Model/InvoiceModel");
const Customer = require("../Src/modules/Customer/Model/CustomerModel");
const { Driver } = require("../Src/modules/Driver/Model/DriverModel");
const { Vehicle } = require("../Src/modules/Vehicle/Model/VehicleModel");
const InvoicePdfService = require("../Src/modules/Invoice/Service/InvoicePdfService");

async function runTest() {
    try {
        console.log("Connecting to MongoDB...");
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Connected successfully!");

        // Find the invoice we just created
        const invoice = await Invoice.findOne({ invoiceNumber: /^MOCK-INV-/ })
            .populate("customer")
            .populate("driver")
            .populate("vehicle");

        if (!invoice) {
            throw new Error("No test invoice found to generate PDF from.");
        }

        console.log("Generating PDF for invoice:", invoice.invoiceNumber);
        
        // Define temporary output path inside the workspace scratch folder
        const outputPath = path.join(__dirname, "test_invoice_with_terms.pdf");
        const writeStream = fs.createWriteStream(outputPath);

        // We wrap it in a promise to wait for completion
        const pdfPromise = new Promise((resolve, reject) => {
            writeStream.on("finish", resolve);
            writeStream.on("error", reject);
        });

        // Call the service
        InvoicePdfService.generateInvoicePdf(invoice, writeStream);

        await pdfPromise;
        console.log("PDF generated successfully at:", outputPath);
        console.log("File size:", fs.statSync(outputPath).size, "bytes");

    } catch (err) {
        console.error("Error running test:", err);
    } finally {
        await mongoose.disconnect();
        console.log("Disconnected from MongoDB.");
    }
}

runTest();
