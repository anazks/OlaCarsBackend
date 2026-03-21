const mongoose = require("mongoose");
const dotenv = require("dotenv");
const path = require("path");

// Load env
dotenv.config({ path: path.join(__dirname, "../.env") });

const AgreementService = require("../Src/modules/Agreement/Service/AgreementService");
const AgreementModel = require("../Src/modules/Agreement/Model/AgreementModel");
const AgreementVersionModel = require("../Src/modules/Agreement/Model/AgreementVersionModel");
const { Driver } = require("../Src/modules/Driver/Model/DriverModel");
const { Vehicle } = require("../Src/modules/Vehicle/Model/VehicleModel");
const Branch = require("../Src/modules/Branch/Model/BranchModel");

async function runTest() {
  try {
    console.log("Connecting to database...");
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected successfully.");

    // 1. Create Mock Branch
    const branch = await Branch.create({
        name: "Test Branch " + Date.now(),
        code: "TB" + Date.now(),
        address: "123 Test St",
        city: "Test City",
        state: "TS",
        phone: "1234567890",
        country: "US",
        createdBy: new mongoose.Types.ObjectId(),
        creatorRole: "ADMIN"
    });

    // 2. Create Mock Vehicle
    const vehicle = await Vehicle.create({
        status: "ACTIVE — AVAILABLE",
        purchaseDetails: {
            branch: branch._id
        },
        basicDetails: {
            make: "Toyota",
            model: "Camry",
            year: 2024,
            vin: "VIN123456789",
            colour: "Silver"
        },
        legalDocs: {
            registrationNumber: "ABC-123"
        },
        createdBy: new mongoose.Types.ObjectId(),
        creatorRole: "ADMIN"
    });

    // 3. Create Mock Driver
    const driverUserId = new mongoose.Types.ObjectId();
    const driver = await Driver.create({
        personalInfo: {
            fullName: "John Driver",
            email: "john@test.com",
            phone: "+123456789"
        },
        branch: branch._id,
        currentVehicle: vehicle._id,
        createdBy: new mongoose.Types.ObjectId(),
        creatorRole: "ADMIN"
    });

    // 4. Create Agreement Template
    const templateContent = `
        <h1>Driver Contract</h1>
        <p>This contract is for <strong>{{DRIVER_NAME}}</strong>.</p>
        <p>Assigned Vehicle: {{VEHICLE_MAKE}} {{VEHICLE_MODEL}} ({{VEHICLE_PLATE}})</p>
        <p>Branch: {{BRANCH_NAME}}</p>
        <p>Date: {{CURRENT_DATE}}</p>
    `;

    const agreement = await AgreementService.createAgreement(
        {
            title: "Dynamic Contract Test " + Date.now(),
            country: "US",
            type: "OTHER",
            content: templateContent,
            status: "PUBLISHED"
        },
        new mongoose.Types.ObjectId(),
        "ADMIN"
    );

    // 5. Render Agreement
    console.log("\nRendering agreement for driver...");
    const result = await AgreementService.renderAgreement(agreement._id, driver._id);
    
    console.log("Rendered Content Snippet:");
    console.log(result.renderedContent.substring(0, 500));

    // 6. Verify placeholders
    const expectedSubstrings = [
        "John Driver",
        "Toyota",
        "Camry",
        "ABC-123",
        branch.name
    ];

    for (const sub of expectedSubstrings) {
        if (!result.renderedContent.includes(sub)) {
            throw new Error(`FAIL: Placeholder replacement failed for "${sub}"`);
        }
    }

    console.log("\nALL DYNAMIC TEMPLATE TESTS PASSED!");

  } catch (error) {
    console.error("\nTEST FAILED with error:", error);
  } finally {
    // Cleanup - intentional wait to avoid race conditions with DB
    // await Branch.deleteMany({ name: { $regex: "Test Branch" } });
    // await Vehicle.deleteMany({ "basicDetails.vin": "VIN123456789" });
    // await Driver.deleteMany({ "personalInfo.email": "john@test.com" });
    await mongoose.connection.close();
    process.exit(0);
  }
}

runTest();
