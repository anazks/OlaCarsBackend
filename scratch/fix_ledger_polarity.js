const mongoose = require("mongoose");
require("dotenv").config();

const DRY_RUN = process.argv.includes("--commit") ? false : true;

async function run() {
    await mongoose.connect(process.env.MONGO_URI);
    const db = mongoose.connection.db;

    console.log(`Database Correction Script. DRY_RUN = ${DRY_RUN}`);

    const entriesCol = db.collection("ledgerentries");

    // 1. Swap polarity on "Invoice Created" entries
    const invoiceCursor = entriesCol.find({ description: { $regex: /^Invoice Created/ } });
    let invoiceCount = 0;
    const invoiceBulkOps = [];

    while (await invoiceCursor.hasNext()) {
        const doc = await invoiceCursor.next();
        const oldType = doc.type;
        const newType = oldType === "DEBIT" ? "CREDIT" : "DEBIT";
        
        let newDesc = doc.description;
        if (oldType === "CREDIT" && doc.description.includes("Credit Accounts Receivable")) {
            newDesc = doc.description.replace("Credit Accounts Receivable", "Debit Accounts Receivable");
        } else if (oldType === "DEBIT" && doc.description.includes("Debit Rental Income")) {
            newDesc = doc.description.replace("Debit Rental Income", "Credit Rental Income");
        }

        invoiceCount++;
        invoiceBulkOps.push({
            updateOne: {
                filter: { _id: doc._id },
                update: { $set: { type: newType, description: newDesc } }
            }
        });
    }

    console.log(`Prepared ${invoiceCount} "Invoice Created" entries for swap.`);

    // 2. Swap polarity on "Payment Received" double-entry legs
    const pmtRecCursor = entriesCol.find({ description: { $regex: /^Payment Received/ } });
    let pmtRecCount = 0;
    const pmtRecBulkOps = [];

    while (await pmtRecCursor.hasNext()) {
        const doc = await pmtRecCursor.next();
        const oldType = doc.type;
        const newType = oldType === "DEBIT" ? "CREDIT" : "DEBIT";

        let newDesc = doc.description;
        if (oldType === "CREDIT" && doc.description.includes("Credit Bank/Cash")) {
            newDesc = doc.description.replace("Credit Bank/Cash", "Debit Bank/Cash");
        } else if (oldType === "DEBIT" && doc.description.includes("Debit Accounts Receivable")) {
            newDesc = doc.description.replace("Debit Accounts Receivable", "Credit Accounts Receivable");
        }

        pmtRecCount++;
        pmtRecBulkOps.push({
            updateOne: {
                filter: { _id: doc._id },
                update: { $set: { type: newType, description: newDesc } }
            }
        });
    }

    console.log(`Prepared ${pmtRecCount} "Payment Received" double entries for swap.`);

    // 3. Delete redundant driver income entries (e.g. "Payment [CREDIT] for Driver [Vehicle Rental Income]")
    const redundantFilter = {
        description: { $regex: /^Payment .* for Driver \[Vehicle Rental Income\]/ },
        accountingCode: new mongoose.Types.ObjectId("69ba2d9a14667588d5bcc4ea")
    };
    const redundantCount = await entriesCol.countDocuments(redundantFilter);
    console.log(`Found ${redundantCount} redundant direct driver income ledger entries to delete.`);

    if (!DRY_RUN) {
        if (invoiceBulkOps.length > 0) {
            console.log("Executing Invoice Created updates...");
            const res = await entriesCol.bulkWrite(invoiceBulkOps);
            console.log(`Updated ${res.modifiedCount} Invoice Created records.`);
        }
        if (pmtRecBulkOps.length > 0) {
            console.log("Executing Payment Received updates...");
            const res = await entriesCol.bulkWrite(pmtRecBulkOps);
            console.log(`Updated ${res.modifiedCount} Payment Received records.`);
        }
        if (redundantCount > 0) {
            console.log("Executing Redundant entries deletion...");
            const res = await entriesCol.deleteMany(redundantFilter);
            console.log(`Deleted ${res.deletedCount} redundant records.`);
        }
        console.log("Migration committed successfully!");
    } else {
        console.log("DRY RUN completed. No database changes were written.");
    }

    process.exit(0);
}

run().catch(err => {
    console.error("Migration failed:", err);
    process.exit(1);
});
