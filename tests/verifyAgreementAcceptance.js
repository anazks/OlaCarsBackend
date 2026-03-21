const mongoose = require("mongoose");
const dotenv = require("dotenv");
const path = require("path");

// Load env
dotenv.config({ path: path.join(__dirname, "../.env") });

const AgreementService = require("../Src/modules/Agreement/Service/AgreementService");
const AgreementAcceptanceService = require("../Src/modules/Agreement/Service/AgreementAcceptanceService");
const AgreementModel = require("../Src/modules/Agreement/Model/AgreementModel");
const AgreementVersionModel = require("../Src/modules/Agreement/Model/AgreementVersionModel");
const AgreementAcceptanceModel = require("../Src/modules/Agreement/Model/AgreementAcceptanceModel");

async function runTest() {
  try {
    console.log("Connecting to database...");
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected successfully.");

    const testTitle = "Legal Agreement " + Date.now();
    const userId = new mongoose.Types.ObjectId();
    const userRole = "ADMIN";

    // 1. Create original agreement
    console.log("\n1. Creating original agreement...");
    const agreement = await AgreementService.createAgreement(
      {
        title: testTitle,
        country: "US",
        type: "TERMS_AND_CONDITIONS",
        content: "<h1>Initial Terms</h1>",
        status: "PUBLISHED"
      },
      userId,
      userRole
    );
    
    const versions = await AgreementVersionModel.find({ agreementId: agreement._id }).sort({ version: 1 });
    const v1 = versions[0];
    console.log(`Success: Agreement created. Version 1 ID: ${v1._id}`);

    // 2. Record acceptance for Version 1
    console.log("\n2. Recording acceptance for Version 1 (TYPED)...");
    const acceptance1 = await AgreementAcceptanceService.acceptAgreement(
        userId,
        agreement._id,
        v1._id,
        "TYPED",
        "John Doe",
        "127.0.0.1",
        "TestBot/1.0"
    );
    console.log("Success: Acceptance recorded. Fingerprint:", acceptance1.digitalFingerprint);

    // 3. Verify latest acceptance (should be true)
    console.log("\n3. Verifying latest acceptance (expecting true)...");
    const verify1 = await AgreementAcceptanceService.verifyLatestAcceptance(userId, agreement._id);
    console.log("Result:", verify1.accepted);
    if (!verify1.accepted) throw new Error("Verification failed: expected true");

    // 4. Update agreement to Version 2
    console.log("\n4. Updating agreement to Version 2...");
    await AgreementService.updateAgreement(
        agreement._id,
        { content: "<h1>Updated Terms v2</h1>" },
        userId,
        userRole
    );
    
    const updatedAgreement = await AgreementModel.findById(agreement._id);
    console.log(`Success: Agreement updated to version ${updatedAgreement.version}`);

    // 5. Verify latest acceptance (should be false now)
    console.log("\n5. Verifying latest acceptance (expecting false because of new version)...");
    const verify2 = await AgreementAcceptanceService.verifyLatestAcceptance(userId, agreement._id);
    console.log("Result:", verify2.accepted);
    if (verify2.accepted) throw new Error("Verification failed: expected false");

    // 6. Record acceptance for Version 2 (DRAWN mock)
    console.log("\n6. Recording acceptance for Version 2 (DRAWN mock)...");
    const v2 = await AgreementVersionModel.findOne({ agreementId: agreement._id, version: 2 });
    const acceptance2 = await AgreementAcceptanceService.acceptAgreement(
        userId,
        agreement._id,
        v2._id,
        "DRAWN",
        "https://s3.amazonaws.com/signatures/test.png",
        "127.0.0.1",
        "TestBot/1.0"
    );
    console.log("Success: Acceptance for v2 recorded.");

    // 7. Verify latest acceptance (should be true again)
    console.log("\n7. Final verification (expecting true)...");
    const verify3 = await AgreementAcceptanceService.verifyLatestAcceptance(userId, agreement._id);
    console.log("Result:", verify3.accepted);
    if (!verify3.accepted) throw new Error("Verification failed: expected true");

    console.log("\nALL AGREEMENT ACCEPTANCE TESTS PASSED!");

  } catch (error) {
    console.error("\nTEST FAILED with error:", error);
  } finally {
    // Cleanup
    // await AgreementModel.deleteMany({ title: testTitle });
    // await AgreementVersionModel.deleteMany({ title: testTitle });
    // await AgreementAcceptanceModel.deleteMany({ userId: userId });
    await mongoose.connection.close();
    process.exit(0);
  }
}

runTest();
