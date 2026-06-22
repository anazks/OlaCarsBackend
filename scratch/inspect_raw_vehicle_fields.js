const mongoose = require('mongoose');
require('dotenv').config();

const run = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        const db = mongoose.connection.db;
        const collection = db.collection('vehicles');
        
        // Find raw documents
        const docs = await collection.find({}).limit(100).toArray();
        console.log(`Inspecting ${docs.length} raw vehicles.`);
        
        // Let's print all unique keys at any nesting level
        const allKeys = new Set();
        const traverseKeys = (obj, prefix = "") => {
            if (!obj || typeof obj !== "object") return;
            Object.keys(obj).forEach(key => {
                const fullPath = prefix ? `${prefix}.${key}` : key;
                allKeys.add(fullPath);
                traverseKeys(obj[key], fullPath);
            });
        };
        
        docs.forEach(doc => traverseKeys(doc));
        console.log("All raw document keys in vehicles collection:");
        console.log(Array.from(allKeys).sort());
        
        // Let's print unique values of any key containing 'status' or 'type' or 'condition'
        console.log("\nUnique values of status-related keys:");
        const statusKeys = Array.from(allKeys).filter(k => k.toLowerCase().includes("status") || k.toLowerCase().includes("condition") || k.toLowerCase().includes("type"));
        for (const sk of statusKeys) {
            const values = await collection.distinct(sk);
            console.log(`- ${sk}:`, values);
        }
        
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

run();
