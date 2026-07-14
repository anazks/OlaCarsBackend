const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function run() {
    try {
        console.log("Connecting to MongoDB...");
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Connected successfully.");

        const db = mongoose.connection.db;
        const invoicesCol = db.collection('invoices');
        
        console.log("Fetching all invoices from database...");
        const invoices = await invoicesCol.find({}, { projection: { dueDate: 1, generatedAt: 1 } }).toArray();
        console.log(`Found ${invoices.length} invoices.`);

        console.log("Preparing bulk operations...");
        const bulkOps = [];
        for (const doc of invoices) {
            const updates = {};
            if (doc.dueDate) {
                const newDueDate = new Date(doc.dueDate);
                newDueDate.setDate(newDueDate.getDate() + 1);
                updates.dueDate = newDueDate;
            }
            if (doc.generatedAt) {
                const newGeneratedAt = new Date(doc.generatedAt);
                newGeneratedAt.setDate(newGeneratedAt.getDate() + 1);
                updates.generatedAt = newGeneratedAt;
            }

            if (Object.keys(updates).length > 0) {
                bulkOps.push({
                    updateOne: {
                        filter: { _id: doc._id },
                        update: { $set: updates }
                    }
                });
            }
        }

        if (bulkOps.length > 0) {
            console.log(`Executing bulkWrite for ${bulkOps.length} updates...`);
            const chunkSize = 5000;
            for (let i = 0; i < bulkOps.length; i += chunkSize) {
                const chunk = bulkOps.slice(i, i + chunkSize);
                console.log(`Writing chunk ${i} to ${i + chunk.length}...`);
                const result = await invoicesCol.bulkWrite(chunk, { ordered: false });
                console.log(`Chunk result: matched ${result.matchedCount}, modified ${result.modifiedCount}`);
            }
            console.log("All chunks executed successfully.");
        } else {
            console.log("No invoices need updates.");
        }

        console.log("Invoice dates successfully updated.");
        process.exit(0);
    } catch (err) {
        console.error("Execution failed:", err);
        process.exit(1);
    }
}

run();
