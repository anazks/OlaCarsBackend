const mongoose = require("mongoose");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });
const CreditNote = require("../Src/modules/CreditNote/Model/CreditNoteModel");
const CreditNoteService = require("../Src/modules/CreditNote/Service/CreditNoteService");
const CreditNotePdfService = require("../Src/modules/CreditNote/Service/CreditNotePdfService");
const fs = require("fs");

async function run() {
    try {
        console.log("Connecting to MongoDB...");
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Connected.");

        console.log("Fetching all credit notes...");
        const notes = await CreditNote.find({});
        console.log(`Found ${notes.length} credit notes.`);

        let errorCount = 0;
        for (const note of notes) {
            try {
                // Fetch fully populated note details
                const populatedNote = await CreditNoteService.getCreditNoteById(note._id);
                
                // Write to a dummy stream / dev/null equivalent or buffer
                const Writable = require("stream").Writable;
                const dummyStream = new Writable({
                    write(chunk, encoding, callback) {
                        callback();
                    }
                });

                CreditNotePdfService.generateCreditNotePdf(populatedNote, dummyStream);
                console.log(`[SUCCESS] PDF generated for Credit Note ID: ${note._id} Number: ${note.creditNoteNumber}`);
            } catch (err) {
                console.error(`[ERROR] Failed for Credit Note ID: ${note._id} Number: ${note.creditNoteNumber}`);
                console.error(err);
                errorCount++;
            }
        }

        console.log(`Test completed with ${errorCount} errors.`);
        process.exit(errorCount > 0 ? 1 : 0);
    } catch (err) {
        console.error("Fatal test error:", err);
        process.exit(1);
    }
}

run();
