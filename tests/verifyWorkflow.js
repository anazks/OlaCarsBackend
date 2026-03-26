/**
 * Verification: Vehicle Onboarding v3.0
 * Self-contained — mocks mongoose before any require.
 */

// Step 1: Install mock BEFORE anything touches mongoose
const originalRequire = module.constructor.prototype.require;
module.constructor.prototype.require = function (id) {
    if (id === "mongoose") {
        const Schema = function (def, opts) { this.paths = {}; };
        Schema.Types = { ObjectId: "ObjectId" };
        Schema.prototype.index = function () { };
        return { Schema, model: (n, s) => ({ modelName: n, schema: s }) };
    }
    return originalRequire.apply(this, arguments);
};

// Step 2: Require project modules
const { STATUS_RULES } = require("../Src/modules/Vehicle/Service/VehicleWorkflowService");
const { VEHICLE_STATUSES } = require("../Src/modules/Vehicle/Model/VehicleModel");
const { ROLES } = require("../Src/shared/constants/roles");

// Step 3: Restore
module.constructor.prototype.require = originalRequire;

// Test harness
let P = 0, F = 0;
const ok = (c, n) => { if (c) { P++; console.log("  + " + n) } else { F++; console.log("  X FAIL: " + n) } };

console.log("\n[1] Statuses");
ok(VEHICLE_STATUSES.length === 16, "16 statuses");
["PENDING ENTRY", "DOCUMENTS REVIEW", "INSURANCE VERIFICATION", "INSPECTION REQUIRED",
    "INSPECTION FAILED", "REPAIR IN PROGRESS", "ACCOUNTING SETUP", "GPS ACTIVATION",
    "BRANCH MANAGER APPROVAL", "ACTIVE \u2014 AVAILABLE", "ACTIVE \u2014 RENTED",
    "ACTIVE \u2014 MAINTENANCE", "SUSPENDED", "TRANSFER PENDING", "TRANSFER COMPLETE", "RETIRED"
].forEach(s => ok(VEHICLE_STATUSES.includes(s), s));

console.log("\n[2] Rules coverage");
ok(Object.keys(STATUS_RULES).length === 16, "16 rules");
VEHICLE_STATUSES.forEach(s => ok(!!STATUS_RULES[s], "Rule: " + s));

console.log("\n[3] Transitions");
const T = (a, b) => ok(STATUS_RULES[b].allowedFrom.includes(a), a + " -> " + b);
const N = (a, b) => ok(!STATUS_RULES[b].allowedFrom.includes(a), a + " -/-> " + b);
T("PENDING ENTRY", "DOCUMENTS REVIEW");
T("DOCUMENTS REVIEW", "INSPECTION REQUIRED");
T("INSURANCE VERIFICATION", "INSPECTION REQUIRED");
T("INSPECTION REQUIRED", "ACCOUNTING SETUP");
T("ACCOUNTING SETUP", "GPS ACTIVATION");
T("GPS ACTIVATION", "BRANCH MANAGER APPROVAL");
T("BRANCH MANAGER APPROVAL", "ACTIVE \u2014 AVAILABLE");
T("DOCUMENTS REVIEW", "PENDING ENTRY");
T("INSURANCE VERIFICATION", "DOCUMENTS REVIEW");
T("INSPECTION REQUIRED", "INSPECTION FAILED");
T("INSPECTION FAILED", "REPAIR IN PROGRESS");
T("REPAIR IN PROGRESS", "INSPECTION REQUIRED");
T("ACTIVE \u2014 AVAILABLE", "TRANSFER PENDING");
T("TRANSFER PENDING", "TRANSFER COMPLETE");
T("TRANSFER COMPLETE", "ACTIVE \u2014 AVAILABLE");
T("ACTIVE \u2014 AVAILABLE", "SUSPENDED");
T("ACTIVE \u2014 RENTED", "SUSPENDED");
T("SUSPENDED", "ACTIVE \u2014 AVAILABLE");
T("ACTIVE \u2014 AVAILABLE", "RETIRED");
T("SUSPENDED", "RETIRED");
N("ACTIVE \u2014 RENTED", "RETIRED");

console.log("\n[4] Gates");
const g = s => STATUS_RULES[s].gateValidator;
ok(g("DOCUMENTS REVIEW")({ legalDocs: {} }, {}) !== null, "Docs: reject");
ok(g("DOCUMENTS REVIEW")({ legalDocs: {} }, { legalDocs: { registrationCertificate: "u", roadTaxDisc: "u", roadworthinessCertificate: "u" } }) === null, "Docs: accept");
ok(g("INSURANCE VERIFICATION")({ insurancePolicy: {} }, {}) !== null, "Ins: reject");
ok(g("INSURANCE VERIFICATION")({ insurancePolicy: {} }, { insurancePolicy: { insuranceType: "X", providerName: "X", policyNumber: "X", startDate: "X", expiryDate: "X" } }) === null, "Ins: accept");
const it23 = Array.from({ length: 23 }, (_, i) => ({ name: "I" + i, condition: "Good" }));
ok(g("INSPECTION REQUIRED")({ inspection: {} }, { inspection: { checklistItems: it23.slice(0, 5) } }) !== null, "Insp: reject");
ok(g("INSPECTION REQUIRED")({ inspection: {} }, { inspection: { checklistItems: it23, exteriorPhotos: ["1", "2", "3", "4", "5", "6"], odometerPhoto: "u" } }) === null, "Insp: accept");
ok(g("ACCOUNTING SETUP")({ inspection: { status: "Pending" } }, {}) !== null, "Acct: reject");
ok(g("ACCOUNTING SETUP")({ inspection: {} }, { inspection: { status: "Passed" } }) === null, "Acct: accept");
ok(g("GPS ACTIVATION")({ accountingSetup: { isSetupComplete: false } }, {}) !== null, "GPS: reject");
ok(g("GPS ACTIVATION")({ accountingSetup: {} }, { accountingSetup: { isSetupComplete: true } }) === null, "GPS: accept");
ok(g("BRANCH MANAGER APPROVAL")({ gpsConfiguration: { isActivated: false } }, {}) !== null, "BM: reject");
ok(g("BRANCH MANAGER APPROVAL")({ gpsConfiguration: {} }, { gpsConfiguration: { isActivated: true } }) === null, "BM: accept");
ok(g("SUSPENDED")({}, {}) !== null, "Susp: reject");
ok(g("SUSPENDED")({}, { suspensionDetails: { reason: "Accident" } }) === null, "Susp: accept");
ok(g("TRANSFER PENDING")({ purchaseDetails: { branch: "a" } }, {}) !== null, "Trans: reject empty");
ok(g("TRANSFER PENDING")({ purchaseDetails: { branch: "a" } }, { transferDetails: { toBranch: "a" } }) !== null, "Trans: reject same");
ok(g("TRANSFER PENDING")({ purchaseDetails: { branch: "a" } }, { transferDetails: { toBranch: "b" } }) === null, "Trans: accept diff");
ok(g("RETIRED")({}, {}) !== null, "Retire: reject");
ok(g("RETIRED")({}, { retirementDetails: { reason: "Sold" } }) === null, "Retire: accept");
ok(g("ACTIVE \u2014 RENTED")({ legalDocs: { registrationExpiry: new Date("2020-01-01") } }, {}) !== null, "Rent: reject expired registration");
ok(g("ACTIVE \u2014 RENTED")({ legalDocs: { registrationExpiry: new Date("2030-01-01"), roadTaxExpiry: new Date("2030-01-01") }, insuranceDetails: { toDate: new Date("2030-01-01") } }, {}) === null, "Rent: accept valid");
ok(g("ACTIVE \u2014 RENTED")({ legalDocs: { registrationExpiry: new Date("2030-01-01"), roadTaxExpiry: new Date("2030-01-01") }, insuranceDetails: { toDate: new Date("2020-01-01") } }, {}) !== null, "Rent: reject expired insurance");

console.log("\n[5] Roles");
ok(STATUS_RULES["DOCUMENTS REVIEW"].allowedRoles.includes(ROLES.OPERATIONSTAFF), "OpStaff->docs");
ok(STATUS_RULES["INSURANCE VERIFICATION"].allowedRoles.includes(ROLES.FINANCESTAFF), "FinStaff->ins");
ok(STATUS_RULES["REPAIR IN PROGRESS"].allowedRoles.includes(ROLES.WORKSHOPSTAFF), "Workshop->repair");
ok(STATUS_RULES["BRANCH MANAGER APPROVAL"].allowedRoles.includes(ROLES.BRANCHMANAGER), "BM->approval");
ok(STATUS_RULES["ACTIVE \u2014 RENTED"].allowedRoles.length === 0, "Rented=system");
ok(STATUS_RULES["SUSPENDED"].allowedRoles.includes(ROLES.BRANCHMANAGER), "BM->suspend");
ok(STATUS_RULES["RETIRED"].allowedRoles.includes(ROLES.COUNTRYMANAGER), "CM->retire");

console.log("\n=== " + P + " passed, " + F + " failed ===");
if (F > 0) { console.log("FAILED"); process.exit(1) }
else { console.log("ALL PASSED"); process.exit(0) }
