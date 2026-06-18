const mongoose = require("mongoose");
const dotenv = require("dotenv");
const path = require("path");

dotenv.config({ path: path.join(__dirname, "../.env") });

async function run() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Connected to DB!");

        const drivers = await mongoose.connection.db.collection("drivers").find({}).toArray();
        console.log(`Total drivers in DB: ${drivers.length}`);

        console.log("\nSample drivers:");
        drivers.slice(0, 10).forEach(d => {
            console.log(`- ID: ${d._id}, Name: ${d.personalInfo?.fullName}, currentVehicle: ${d.currentVehicle}`);
        });

        const activeDriversWithVehicle = drivers.filter(d => d.currentVehicle);
        console.log(`\nDrivers with currentVehicle assigned: ${activeDriversWithVehicle.length}`);
        activeDriversWithVehicle.slice(0, 5).forEach(d => {
            console.log(`- Driver: ${d.personalInfo?.fullName}, Vehicle ID: ${d.currentVehicle}`);
        });

    } catch (e) {
        console.error(e);
    } finally {
        await mongoose.connection.close();
    }
}
run();
