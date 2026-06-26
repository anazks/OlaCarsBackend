const mongoose = require("mongoose");
const dotenv = require("dotenv");
const path = require("path");

dotenv.config({ path: path.join(__dirname, "../.env") });

require("../Src/modules/Branch/Model/BranchModel.js");
const { Driver } = require("../Src/modules/Driver/Model/DriverModel");

async function run() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Connected!");

        const buildInfo = await mongoose.connection.db.admin().buildInfo();
        console.log("MongoDB Server Version:", buildInfo.version);

        console.log("\n--- Method 4: Using .setOptions({ allowDiskUse: true }) ---");
        try {
            const q4 = await Driver.find({ isDeleted: false })
                .sort({ createdAt: -1 })
                .limit(1000)
                .setOptions({ allowDiskUse: true });
            console.log("Method 4 success! Count:", q4.length);
        } catch (err) {
            console.error("Method 4 failed:", err.message);
        }

    } catch (e) {
        console.error(e);
    } finally {
        await mongoose.connection.close();
    }
}
run();
