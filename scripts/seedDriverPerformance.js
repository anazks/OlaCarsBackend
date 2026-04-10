const mongoose = require("mongoose");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const { Driver } = require("../Src/modules/Driver/Model/DriverModel");
const { Vehicle } = require("../Src/modules/Vehicle/Model/VehicleModel");

async function seedHistoricalData() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Connected to MongoDB");

        const activeDrivers = await Driver.find({ status: "ACTIVE", currentVehicle: { $exists: true } }).populate("currentVehicle");
        console.log(`Found ${activeDrivers.length} active drivers with vehicles.`);

        const months = ["January", "February", "March", "April"];
        const year = 2026;

        for (const driver of activeDrivers) {
            const vehicle = driver.currentVehicle;
            const rentAmount = (vehicle && vehicle.basicDetails && vehicle.basicDetails.monthlyRent) || 1500;

            // Seed Performance
            const performance = {
                avgSpeed: Math.floor(Math.random() * (60 - 30) + 30),
                totalDistance: Math.floor(Math.random() * (5000 - 1000) + 1000),
                drivingScore: Math.floor(Math.random() * (100 - 80) + 80),
                fuelEfficiency: parseFloat((Math.random() * (15 - 10) + 10).toFixed(1)),
                safetyEvents: {
                    braking: Math.floor(Math.random() * 5),
                    speeding: Math.floor(Math.random() * 3),
                    acceleration: Math.floor(Math.random() * 4),
                },
                lastUpdated: new Date()
            };

            // Seed Rent Tracking
            const rentTracking = months.map((month, index) => ({
                month,
                year,
                amount: rentAmount,
                status: index < 3 ? "PAID" : "PENDING", // Jan, Feb, Mar Paid. April Pending.
                paidAt: index < 3 ? new Date(year, index, 15) : null
            }));

            await Driver.findByIdAndUpdate(driver._id, {
                $set: { performance, rentTracking }
            });

            console.log(`Updated driver: ${driver.personalInfo.fullName}`);
        }

        console.log("Seeding completed successfully.");
        process.exit(0);
    } catch (error) {
        console.error("Seeding failed:", error);
        process.exit(1);
    }
}

seedHistoricalData();
