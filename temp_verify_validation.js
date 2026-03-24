const { createAgreementSchema, updateAgreementSchema } = require("./Src/modules/Agreement/Validation/AgreementValidation");

const testData = {
    title: "Driver Agreement Test",
    country: "US",
    type: "DRIVER_AGREEMENT",
    content: "<p>Test content</p>",
    status: "DRAFT"
};

const createResult = createAgreementSchema.validate(testData);
if (createResult.error) {
    console.error("Create validation failed:", createResult.error.details[0].message);
    process.exit(1);
} else {
    console.log("Create validation passed!");
}

const updateResult = updateAgreementSchema.validate({ type: "LEGAL_AGREEMENT" });
if (updateResult.error) {
    console.error("Update validation failed:", updateResult.error.details[0].message);
    process.exit(1);
} else {
    console.log("Update validation passed!");
}

console.log("All validation tests passed!");
