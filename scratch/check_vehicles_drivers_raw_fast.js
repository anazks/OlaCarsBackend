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
        const vehicles = await db.collection("vehicles").find({}, { projection: { currentDriver: 1, "legalDocs.registrationNumber": 1 } }).toArray();
        console.log(`Total vehicles in DB: ${vehicles.length}`);

        const drivers = await db.collection("drivers").find({}, { projection: { currentVehicle: 1, "personalInfo.fullName": 1 } }).toArray();
        console.log(`Total drivers in DB: ${drivers.length}`);

        console.log("\n--- Vehicles with non-empty currentDriver ---");
        const vehiclesWithDriver = vehicles.filter(v => v.currentDriver);
        console.log(`Vehicles with currentDriver: ${vehiclesWithDriver.length}`);
        vehiclesWithDriver.forEach(v => {
            const driver = drivers.find(d => d._id.toString() === v.currentDriver.toString());
            console.log(`Vehicle ID: ${v._id}, Plate: ${v.legalDocs?.registrationNumber}, Driver ID: ${v.currentDriver}, Driver Name: ${driver ? driver.personalInfo?.fullName : 'NOT FOUND IN DRIVERS'}`);
        });

        console.log("\n--- Drivers with non-empty currentVehicle ---");
        const driversWithVehicle = drivers.filter(d => d.currentVehicle);
        console.log(`Drivers with currentVehicle: ${driversWithVehicle.length}`);
        driversWithVehicle.forEach(d => {
            const vehicle = vehicles.find(v => v._id.toString() === d.currentVehicle.toString());
            console.log(`Driver ID: ${d._id}, Driver Name: ${d.personalInfo?.fullName}, Vehicle ID: ${d.currentVehicle}, Vehicle Plate: ${vehicle ? vehicle.legalDocs?.registrationNumber : 'NOT FOUND IN VEHICLES'}`);
        });

    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}
run();
