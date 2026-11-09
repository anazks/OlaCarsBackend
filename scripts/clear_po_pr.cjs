const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
    console.error("MONGO_URI is not defined in .env!");
    process.exit(1);
}

async function run() {
    try {
        console.log("Connecting to MongoDB...");
        await mongoose.connect(MONGO_URI);
        console.log("Connected successfully to DB:", mongoose.connection.name);

        const poCollection = mongoose.connection.collection('purchaseorders');
        const prCollection = mongoose.connection.collection('workshopprocurements');
        const woCollection = mongoose.connection.collection('workorders');

        const poCountBefore = await poCollection.countDocuments();
        const prCountBefore = await prCollection.countDocuments();

        console.log(`Current Purchase Orders (PO): ${poCountBefore}`);
        console.log(`Current Purchase Requests (PR): ${prCountBefore}`);

        // Delete all POs
        const poDeleteResult = await poCollection.deleteMany({});
        console.log(`Deleted ${poDeleteResult.deletedCount} Purchase Orders.`);

        // Delete all PRs
        const prDeleteResult = await prCollection.deleteMany({});
        console.log(`Deleted ${prDeleteResult.deletedCount} Purchase Requests.`);

        // Clean up any references in work orders parts
        const woUpdateResult = await woCollection.updateMany(
            { "parts.purchaseOrderId": { $exists: true } },
            { $unset: { "parts.$[].purchaseOrderId": "" } }
        );
        console.log(`Updated Work Orders referencing cleared POs: ${woUpdateResult.modifiedCount}`);

        const poCountAfter = await poCollection.countDocuments();
        const prCountAfter = await prCollection.countDocuments();

        console.log("Verification:");
        console.log(`Remaining Purchase Orders: ${poCountAfter}`);
        console.log(`Remaining Purchase Requests: ${prCountAfter}`);

        console.log("Database cleanup of PO & PR completed successfully!");
    } catch (err) {
        console.error("Error during DB cleanup:", err);
    } finally {
        await mongoose.disconnect();
        console.log("Disconnected from MongoDB.");
    }
}

run();

