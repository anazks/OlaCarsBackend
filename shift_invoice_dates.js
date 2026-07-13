const mongoose = require("mongoose");
require("dotenv").config();

async function run() {
    console.log("Connecting to MongoDB...");
    const mongoUri = process.env.MONGO_URI || process.env.DATABASE_URL;
    if (!mongoUri) {
        console.error("MONGO_URI or DATABASE_URL not found in environment variables.");
        process.exit(1);
    }
    await mongoose.connect(mongoUri);
    console.log("Connected to MongoDB successfully.");

    const { Invoice } = require("./Src/modules/Invoice/Model/InvoiceModel");

    console.log("Fetching all invoices...");
    const invoices = await Invoice.find({}).lean();
    const totalCount = invoices.length;
    console.log(`Found ${totalCount} invoices in total.`);

    const BATCH_SIZE = 1000;
    let completedCount = 0;
    let bulkOps = [];

    for (let i = 0; i < totalCount; i++) {
        const inv = invoices[i];
        const updateFields = {};

        if (inv.generatedAt) {
            updateFields.generatedAt = new Date(inv.generatedAt.getTime() - 24 * 60 * 60 * 1000);
        }
        if (inv.dueDate) {
            updateFields.dueDate = new Date(inv.dueDate.getTime() - 24 * 60 * 60 * 1000);
        }

        if (Object.keys(updateFields).length > 0) {
            bulkOps.push({
                updateOne: {
                    filter: { _id: inv._id },
                    update: { $set: updateFields }
                }
            });
        }

        completedCount++;

        if (bulkOps.length >= BATCH_SIZE || i === totalCount - 1) {
            if (bulkOps.length > 0) {
                await Invoice.bulkWrite(bulkOps);
                bulkOps = [];
            }
            console.log(`Progress: ${completedCount}/${totalCount} invoices updated.`);
        }
    }

    console.log(`All done! Successfully updated all ${completedCount}/${totalCount} invoices.`);
    await mongoose.disconnect();
    console.log("Disconnected from MongoDB.");
}

run().catch(err => {
    console.error("Error running script:", err);
    process.exit(1);
});
