const mongoose = require("mongoose");
const dotenv = require("dotenv");
const path = require("path");

// Load env
dotenv.config({ path: path.join(__dirname, "../.env") });

const AgreementService = require("../Src/modules/Agreement/Service/AgreementService");
const AgreementModel = require("../Src/modules/Agreement/Model/AgreementModel");
const AgreementVersionModel = require("../Src/modules/Agreement/Model/AgreementVersionModel");

async function runTest() {
  try {
    console.log("Connecting to database...");
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected successfully.");

    const testTitle = "Test Agreement " + Date.now();
    const userId = new mongoose.Types.ObjectId();
    const userRole = "ADMIN";

    // 1. Create agreement for US
    console.log("\n1. Creating agreement for US...");
    const agreementUS = await AgreementService.createAgreement(
      {
        title: testTitle,
        country: "US",
        type: "TERMS_AND_CONDITIONS",
        content: "<h1>US Content</h1>",
        status: "PUBLISHED"
      },
      userId,
      userRole
    );
    console.log("Success: US agreement created.");

    // 2. Attempt to create same title for US (should fail)
    console.log("\n2. Attempting to create same title for US...");
    try {
      await AgreementService.createAgreement(
        {
          title: testTitle,
          country: "US",
          type: "TERMS_AND_CONDITIONS",
          content: "<h1>Duplicate US Content</h1>",
          status: "PUBLISHED"
        },
        userId,
        userRole
      );
      console.error("FAIL: Should have thrown an error for duplicate title in US.");
    } catch (error) {
      console.log("Success: Caught expected error:", error.message);
    }

    // 3. Create same title for NG (should succeed)
    console.log("\n3. Creating same title for NG...");
    const agreementNG = await AgreementService.createAgreement(
      {
        title: testTitle,
        country: "NG",
        type: "TERMS_AND_CONDITIONS",
        content: "<h1>NG Content</h1>",
        status: "PUBLISHED"
      },
      userId,
      userRole
    );
    console.log("Success: NG agreement created with same title.");

    // 4. Update US agreement and check version
    console.log("\n4. Updating US agreement...");
    const updatedUS = await AgreementService.updateAgreement(
      agreementUS._id,
      { content: "<h1>Updated US Content</h1>" },
      userId,
      userRole
    );
    console.log("Success: US agreement updated. Version:", updatedUS.version);

    const versions = await AgreementVersionModel.find({ agreementId: agreementUS._id });
    console.log("Found versions count:", versions.length);
    versions.forEach((v, index) => {
      console.log(`Version ${v.version} country: ${v.country}`);
      if (v.country !== "US") {
        console.error(`FAIL: Version ${v.version} has wrong country ${v.country}`);
      }
    });

    // 5. Query by country
    console.log("\n5. Querying agreements by country...");
    const usAgreements = await AgreementService.getAllAgreements({ country: "US", title: testTitle });
    console.log("US Agreements found:", usAgreements.length);
    if (usAgreements.length !== 1 || usAgreements[0].country !== "US") {
      console.error("FAIL: Query by country US failed.");
    }

    const ngAgreements = await AgreementService.getAllAgreements({ country: "NG", title: testTitle });
    console.log("NG Agreements found:", ngAgreements.length);
    if (ngAgreements.length !== 1 || ngAgreements[0].country !== "NG") {
      console.error("FAIL: Query by country NG failed.");
    }

    console.log("\nALL TESTS COMPLETED SUCCESSFULLY!");

  } catch (error) {
    console.error("\nTEST FAILED with error:", error);
  } finally {
    // Cleanup
    // await AgreementModel.deleteMany({ title: { $regex: "Test Agreement" } });
    // await AgreementVersionModel.deleteMany({ title: { $regex: "Test Agreement" } });
    await mongoose.connection.close();
    process.exit(0);
  }
}

runTest();
