const mongoose = require("mongoose");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });
const connectDB = require("../Src/config/dbConfig");

require("../Src/modules/Fleet/Model/FleetModel");
const { Vehicle } = require("../Src/modules/Vehicle/Model/VehicleModel");

async function main() {
    await connectDB();
    const v = await Vehicle.findById('6a28214ac3bc99646284878d').populate("fleet").lean();
    console.log("Full vehicle doc:", JSON.stringify(v, null, 2));
    await mongoose.disconnect();
}

main().catch(console.error);
