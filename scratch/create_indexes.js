const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/olacars";

async function run() {
    try {
        await mongoose.connect(MONGO_URI);
        console.log("Connected to DB. Creating indexes...");
        
        const db = mongoose.connection.db;
        const result = await db.collection('paymenttransactions').createIndex({ referenceId: 1, referenceModel: 1 });
        console.log("Created index response:", result);
    } catch (e) {
        console.error("Failed to create index:", e);
    } finally {
        await mongoose.disconnect();
    }
}
run();
