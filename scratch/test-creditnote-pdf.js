const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const { Driver } = require("../Src/modules/Driver/Model/DriverModel");
const Invoice = require("../Src/modules/Invoice/Model/InvoiceModel");
const CreditNote = require("../Src/modules/CreditNote/Model/CreditNoteModel");
const CreditNotePdfService = require("../Src/modules/CreditNote/Service/CreditNotePdfService");
const CreditNoteService = require("../Src/modules/CreditNote/Service/CreditNoteService");

async function run() {
    try {
        console.log("Connecting to Database...");
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Connected to Database.");

        const id = "6a1e6f9d3eed30b6ef6b8a44";
        console.log(`Fetching Credit Note: ${id}`);
        const doc = await CreditNoteService.getCreditNoteById(id);
        if (!doc) {
            console.error("Credit Note not found");
            process.exit(1);
        }
        console.log("Fetched doc:", JSON.stringify(doc, null, 2));

        console.log("Generating PDF...");
        const writeStream = fs.createWriteStream(path.join(__dirname, "test-output.pdf"));
        CreditNotePdfService.generateCreditNotePdf(doc, writeStream);
        
        writeStream.on("finish", () => {
            console.log("PDF generated successfully!");
            mongoose.connection.close();
            process.exit(0);
        });

        writeStream.on("error", (err) => {
            console.error("Stream error:", err);
            mongoose.connection.close();
            process.exit(1);
        });

    } catch (err) {
        console.error("Error caught:", err);
        mongoose.connection.close();
        process.exit(1);
    }
}

run();
