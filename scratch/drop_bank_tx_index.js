const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function run() {
    try {
        console.log("Connecting to MongoDB...");
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Connected.");

        const collection = mongoose.connection.collection('invoicesetoffhistories');
        const indexes = await collection.indexes();
        console.log("Current indexes on invoicesetoffhistories:", indexes);

        const hasBankTxIndex = indexes.some(idx => idx.name === 'bankTransaction_1');
        if (hasBankTxIndex) {
            await collection.dropIndex('bankTransaction_1');
            console.log("✓ Successfully dropped obsolete index bankTransaction_1");
        } else {
            console.log("Index bankTransaction_1 does not exist.");
        }

    } catch (err) {
        console.error("Error:", err);
    } finally {
        await mongoose.disconnect();
    }
}

run();
