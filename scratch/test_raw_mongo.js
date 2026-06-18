const { MongoClient } = require("mongodb");
const dotenv = require("dotenv");
const path = require("path");

dotenv.config({ path: path.join(__dirname, "../.env") });

async function run() {
    const client = new MongoClient(process.env.MONGO_URI);
    try {
        await client.connect();
        console.log("Connected raw!");

        const db = client.db();
        const collection = db.collection("drivers");

        console.log("\nTesting cursor.sort(...).allowDiskUse(true)...");
        try {
            const docs = await collection.find({ isDeleted: false })
                .sort({ createdAt: -1 })
                .allowDiskUse(true)
                .limit(1000)
                .toArray();
            console.log("Success! Count:", docs.length);
        } catch (err) {
            console.error("Failed:", err.message);
        }

    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}
run();
