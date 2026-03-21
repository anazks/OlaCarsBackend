const mongoose = require("mongoose");
const dotenv = require("dotenv");
const path = require("path");

// Load env
dotenv.config({ path: path.join(__dirname, "../.env") });

const AgreementService = require("../Src/modules/Agreement/Service/AgreementService");
const { Driver } = require("../Src/modules/Driver/Model/DriverModel");
const { Vehicle } = require("../Src/modules/Vehicle/Model/VehicleModel");
const Branch = require("../Src/modules/Branch/Model/BranchModel");
const Lease = require("../Src/modules/Lease/Model/LeaseModel");
const { assignCarToDriver } = require("../Src/modules/Vehicle/Controller/VehicleController");

async function runTest() {
  try {
    console.log("Connecting to database...");
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected successfully.");

    // 1. Setup Mock Data
    const branch = await Branch.create({
        name: "Test Lease Branch " + Date.now(),
        code: "TLB" + Date.now(),
        address: "123 Test St",
        city: "Test City",
        state: "TS",
        phone: "1234567890",
        country: "US",
        createdBy: new mongoose.Types.ObjectId(),
        creatorRole: "ADMIN"
    });

    const vehicle = await Vehicle.create({
        status: "ACTIVE — AVAILABLE",
        purchaseDetails: { branch: branch._id },
        basicDetails: {
            make: "LeaseTest",
            model: "Model X",
            year: 2024,
            vin: "VIN-LEASE-" + Date.now(),
            colour: "Blue"
        },
        createdBy: new mongoose.Types.ObjectId(),
        creatorRole: "ADMIN"
    });

    const driver = await Driver.create({
        personalInfo: {
            fullName: "Lease Tester",
            email: "lease@test" + Date.now() + ".com",
            phone: "+123456789"
        },
        branch: branch._id,
        createdBy: new mongoose.Types.ObjectId(),
        creatorRole: "ADMIN"
    });

    // 2. Mock Request for Assignment
    console.log("\nAssigning vehicle to driver...");
    const req = {
        params: { id: vehicle._id.toString(), driverId: driver._id.toString() },
        body: { leaseDuration: 12, monthlyRent: 1500, notes: "Testing lease creation" },
        user: { id: new mongoose.Types.ObjectId().toString(), role: "ADMIN" }
    };

    const res = {
        statusCode: 200,
        status: function(code) { this.statusCode = code; return this; },
        json: function(data) { this.data = data; return this; }
    };

    await assignCarToDriver(req, res);

    if (!res.data.success) {
        throw new Error("Assignment failed: " + res.data.message);
    }
    console.log("Assignment successful.");

    // 3. Verify Lease Record
    const lease = await Lease.findOne({ driver: driver._id, vehicle: vehicle._id });
    if (!lease) throw new Error("Lease record not found in database");
    console.log(`Lease record found: ${lease.durationMonths} months, ${lease.monthlyRent} rent.`);

    if (lease.durationMonths !== 12 || lease.monthlyRent !== 1500) {
        throw new Error("Lease data mismatch");
    }

    // 4. Create Agreement and Render
    const templateContent = `
        <p>Lease Duration: {{LEASE_DURATION}} months</p>
        <p>Monthly Rent: {{LEASE_MONTHLY_RENT}}</p>
    `;

    const agreement = await AgreementService.createAgreement(
        {
            title: "Lease Integration Test " + Date.now(),
            country: "US",
            type: "OTHER",
            content: templateContent,
            status: "PUBLISHED"
        },
        req.user.id,
        "ADMIN"
    );

    console.log("\nRendering agreement...");
    const result = await AgreementService.renderAgreement(agreement._id, driver._id);
    
    console.log("Rendered Content:");
    console.log(result.renderedContent);

    if (!result.renderedContent.includes("Lease Duration: 12 months")) {
        throw new Error("FAIL: LEASE_DURATION placeholder not replaced correctly");
    }
    if (!result.renderedContent.includes("Monthly Rent: 1500")) {
        throw new Error("FAIL: LEASE_MONTHLY_RENT placeholder not replaced correctly");
    }

    console.log("\nALL LEASE INTEGRATION TESTS PASSED!");

  } catch (error) {
    console.error("\nTEST FAILED with error:", error);
  } finally {
    await mongoose.connection.close();
    process.exit(0);
  }
}

runTest();
