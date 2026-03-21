const mongoose = require("mongoose");
const dotenv = require("dotenv");
const path = require("path");

dotenv.config({ path: path.join(__dirname, "../.env") });

async function run() {
    console.log("Connecting with timeout...");
    try {
        await mongoose.connect(process.env.MONGO_URI, {
            serverSelectionTimeoutMS: 10000, // 10 seconds
        });
        console.log("Connected!");
        await mongoose.connection.close();
    } catch (e) {
        console.error("Connection failed:", e.message);
    }
    process.exit(0);
}
run();
