/**
 * Verification: Driver Dummy Credit Score
 * Mocks mongoose and repo before testing logic.
 */

// Step 1: Install mock BEFORE anything touches mongoose
const originalRequire = module.constructor.prototype.require;
module.constructor.prototype.require = function (id) {
    if (id === "mongoose") {
        const Schema = function (def, opts) { this.paths = {}; };
        Schema.Types = { ObjectId: "ObjectId" };
        Schema.prototype.index = function () { };
        return { 
            Schema, 
            model: (n, s) => ({ modelName: n, schema: s }),
            startSession: async () => ({
                startTransaction: () => {},
                commitTransaction: async () => {},
                abortTransaction: async () => {},
                endSession: () => {}
            })
        };
    }
    if (id.includes("DriverRepo")) {
        return {
            getDriverByIdService: async (id) => ({
                status: "VERIFICATION",
                personalInfo: { fullName: "Test Driver" },
                toObject: function() { return this; }
            }),
            updateDriverService: async (id, data) => data
        };
    }
    return originalRequire.apply(this, arguments);
};

// Step 2: Require service
const { processDriverProgress, evaluateCreditScore } = require("../Src/modules/Driver/Service/DriverWorkflowService");
const { DRIVER_STATUSES } = require("../Src/modules/Driver/Model/DriverModel");
const { ROLES } = require("../Src/shared/constants/roles");

// Step 3: Restore
module.constructor.prototype.require = originalRequire;

// Test harness
let P = 0, F = 0;
const ok = (c, n) => { if (c) { P++; console.log("  + " + n) } else { F++; console.log("  X FAIL: " + n) } };

async function runTests() {
    console.log("\n[1] Dummy Score Generation");
    
    const mockUser = { id: "u123", role: ROLES.FINANCESTAFF };
    const payload = { 
        creditCheck: { 
            consentForm: "s3://consent.pdf" 
        } 
    };

    try {
        const result = await processDriverProgress("d123", "CREDIT CHECK", payload, mockUser);
        
        ok(result.creditCheck.score >= 300 && result.creditCheck.score <= 850, "Random score generated: " + result.creditCheck.score);
        ok(result.creditCheck.isDummy === true, "isDummy flag set");
        ok(result.creditCheck.rating !== undefined, "Rating calculated: " + result.creditCheck.rating);
        ok(result.creditCheck.decision !== undefined, "Decision calculated: " + result.creditCheck.decision);
        ok(result.creditCheck.notes.includes("dummy score"), "Notes updated with dummy info");
        
    } catch (err) {
        F++;
        console.log("  X FATAL: processDriverProgress threw error: " + err.message);
    }

    console.log("\n[2] Explicit Score Override");
    const payloadWithScore = { 
        creditCheck: { 
            score: 777,
            consentForm: "s3://consent.pdf" 
        } 
    };

    try {
        const result = await processDriverProgress("d123", "CREDIT CHECK", payloadWithScore, mockUser);
        ok(result.creditCheck.score === 777, "Explicit score preserved");
        ok(!result.creditCheck.isDummy, "isDummy flag NOT set for explicit score");
        ok(result.creditCheck.rating === "EXCELLENT", "Correct rating for 777");
    } catch (err) {
        F++;
        console.log("  X FATAL: processDriverProgress threw error: " + err.message);
    }

    console.log("\n=== " + P + " passed, " + F + " failed ===");
    if (F > 0) { console.log("FAILED"); process.exit(1) }
    else { console.log("ALL PASSED"); process.exit(0) }
}

runTests();
