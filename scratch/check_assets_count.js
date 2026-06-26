const mongoose = require("mongoose");
const dotenv = require("dotenv");
const path = require("path");

dotenv.config({ path: path.join(__dirname, "../.env") });

const FixedAsset = require("../Src/modules/FixedAsset/Model/FixedAssetModel");

async function run() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        const count = await FixedAsset.countDocuments();
        console.log("Current FixedAsset count in DB:", count);
    } catch (err) {
        console.error(err);
    } finally {
        await mongoose.connection.close();
    }
}

run();
