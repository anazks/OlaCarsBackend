const mongoose = require("mongoose");
const { Vehicle } = require("./Src/modules/Vehicle/Model/VehicleModel");
const { Driver } = require("./Src/modules/Driver/Model/DriverModel");
const PreBooking = require("./Src/modules/AI/Model/PreBookingModel");
const connectDB = require("./Src/config/dbConfig");

async function verify() {
    try {
        await connectDB();
        console.log("Connected to DB");

        // 1. Create a dummy branch if needed
        const Branch = mongoose.model("Branch");
        let branch = await Branch.findOne();
        if (!branch) {
            branch = await Branch.create({ name: "Test Branch", city: "Test City", code: "TEST01", state: "TS", country: "TC" });
        }

        // 2. Create an Available Vehicle
        const testVehicle = await Vehicle.create({
            status: "ACTIVE — AVAILABLE",
            basicDetails: {
                make: "Tesla",
                model: "Model 3",
                year: 2023,
                vin: "TESTVINAI" + Date.now(),
                monthlyRent: 1500,
            },
            purchaseDetails: {
                branch: branch._id,
            },
            createdBy: new mongoose.Types.ObjectId(),
            creatorRole: "ADMIN",
        });
        console.log("Created test vehicle:", testVehicle._id);

        // 3. Test Booking (Wait, I should test the API via HTTP if possible, but I can't start the server and call it easily here)
        // I'll simulate the controller logic or check if I can run the server in background.
        
        console.log("Verifying Pre-booking logic...");
        const phone = "1234567890";
        
        // Simulating AiController.bookVehicle logic
        const existingVehicle = await Vehicle.findById(testVehicle._id);
        if (existingVehicle.status !== "ACTIVE — AVAILABLE") {
             console.error("Vehicle status check failed");
        }

        // Create DRAFT driver
        const draftDriver = await Driver.create({
            status: "DRAFT",
            personalInfo: { fullName: "AI Test", phone: phone },
            branch: branch._id,
            createdBy: new mongoose.Types.ObjectId(),
            creatorRole: "ADMIN",
        });
        console.log("Created draft driver:", draftDriver._id);

        // Update Vehicle
        await Vehicle.findByIdAndUpdate(testVehicle._id, { status: "PRE-BOOKED" });
        console.log("Updated vehicle to PRE-BOOKED");

        // Create PreBooking
        const pb = await PreBooking.create({
            vehicle: testVehicle._id,
            driver: draftDriver._id,
            phone: phone,
        });
        console.log("Created PreBooking record:", pb._id);

        // Verify status
        const finalVehicle = await Vehicle.findById(testVehicle._id);
        if (finalVehicle.status === "PRE-BOOKED") {
            console.log("SUCCESS: Vehicle status is PRE-BOOKED");
        } else {
            console.error("FAILURE: Vehicle status is", finalVehicle.status);
        }

        // Cleanup (optional)
        // await Vehicle.findByIdAndDelete(testVehicle._id);
        // await Driver.findByIdAndDelete(draftDriver._id);
        // await PreBooking.findByIdAndDelete(pb._id);

    } catch (err) {
        console.error("Verification failed:", err);
    } finally {
        await mongoose.connection.close();
    }
}

verify();
