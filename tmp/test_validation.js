const Joi = require("joi");
const validate = require("../Src/shared/middlewares/validate");
const AppError = require("../Src/shared/utils/AppError");

// Mocking required modules/classes for the test environment
// Note: In a real test environment, we would use a test runner like Jest.

const runTest = (name, schema, req, expectedError) => {
    let nextCalled = false;
    let errorPassed = null;

    const next = (err) => {
        nextCalled = true;
        errorPassed = err;
    };

    const res = {}; // Mock res

    validate(schema)(req, res, next);

    if (expectedError) {
        if (errorPassed instanceof AppError && errorPassed.statusCode === 400) {
            console.log(`✅ ${name}: Correctly caught validation error: ${errorPassed.message}`);
        } else {
            console.error(`❌ ${name}: Expected validation error but got:`, errorPassed);
        }
    } else {
        if (nextCalled && !errorPassed) {
            console.log(`✅ ${name}: Passed validation as expected.`);
        } else {
            console.error(`❌ ${name}: Expected validation to pass but got error:`, errorPassed);
        }
    }
};

// Define a test schema
const testSchema = {
    body: Joi.object({
        email: Joi.string().email().required(),
        password: Joi.string().min(6).required(),
    }),
};

// Test Case 1: Valid Data
runTest("Valid Data", testSchema, {
    body: { email: "test@example.com", password: "password123" }
}, false);

// Test Case 2: Missing Email
runTest("Missing Email", testSchema, {
    body: { password: "password123" }
}, true);

// Test Case 3: Invalid Email Format
runTest("Invalid Email", testSchema, {
    body: { email: "not-an-email", password: "password123" }
}, true);

// Test Case 4: Password Too Short
runTest("Short Password", testSchema, {
    body: { email: "test@example.com", password: "123" }
}, true);

// Test Case 5: Strip Unknown Fields
const reqWithUnknown = {
    body: { email: "test@example.com", password: "password123", unknownField: "should-be-gone" }
};
runTest("Strip Unknown Fields", testSchema, reqWithUnknown, false);
if (reqWithUnknown.body.unknownField === undefined) {
    console.log("✅ Strip Unknown Fields: Successfully removed unknown field.");
} else {
    console.error("❌ Strip Unknown Fields: Failed to remove unknown field.");
}
