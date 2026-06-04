const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const { Driver } = require("../Src/modules/Driver/Model/DriverModel");
const Invoice = require("../Src/modules/Invoice/Model/InvoiceModel");
const CreditNote = require("../Src/modules/CreditNote/Model/CreditNoteModel");
const CreditNotePdfService = require("../Src/modules/CreditNote/Service/CreditNotePdfService");

// Dummy stream that discards written data
const { Writable } = require("stream");
const devNull = () => new Writable({
    write(chunk, encoding, callback) {
        setImmediate(callback);
    }
});

async function run() {
    try {
        console.log("Connecting to Database...");
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Connected to Database.");

        console.log("Fetching all Credit Notes...");
        const creditNotes = await CreditNote.find({})
            .populate({
                path: 'driverId',
                select: 'driverId personalInfo branch currentVehicle'
            })
            .populate('invoiceId');

        console.log(`Found ${creditNotes.length} credit notes.`);

        let failedCount = 0;
        for (const doc of creditNotes) {
            try {
                // Try generating
                const stream = devNull();
                CreditNotePdfService.generateCreditNotePdf(doc, stream);
                // Wait briefly for end
                await new Promise((resolve) => {
                    stream.on("finish", resolve);
                    // Force complete for synchronous PDF kit stream
                    resolve();
                });
            } catch (err) {
                console.error(`FAILED for Credit Note ID: ${doc._id}, Number: ${doc.creditNoteNumber}`);
                console.error(err);
                failedCount++;
            }
        }

        console.log(`Test completed. Failures: ${failedCount}/${creditNotes.length}`);
        mongoose.connection.close();
        process.exit(failedCount > 0 ? 1 : 0);

    } catch (err) {
        console.error("Database or query error:", err);
        mongoose.connection.close();
        process.exit(1);
    }
}

run();
