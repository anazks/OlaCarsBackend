const mongoose = require("mongoose");
require("dotenv").config();

async function run() {
    try {
        const uri = process.env.MONGO_URI || "mongodb://localhost:27017/olacars"; // fallback
        console.log("Connecting to:", uri);
        await mongoose.connect(uri);
        const VehicleSchema = new mongoose.Schema({}, { strict: false });
        const Vehicle = mongoose.model("Vehicle", VehicleSchema, "vehicles");

        const aggregation = await Vehicle.aggregate([
            { $group: { _id: "$status", count: { $sum: 1 } } }
        ]);
        console.log("Vehicle Statuses Count in Database:", aggregation);

        const vehicles = await Vehicle.find({ status: { $regex: /maintenance|repair/i } });
        console.log("Vehicles in Maintenance or Repair:");
        vehicles.forEach(v => {
            console.log(`- VIN: ${v.basicDetails?.vin}, Status: ${v.status}, Name: ${v.basicDetails?.make} ${v.basicDetails?.model}`);
        });

    } catch (err) {
        console.error(err);
    } finally {
        await mongoose.disconnect();
    }
}

run();
