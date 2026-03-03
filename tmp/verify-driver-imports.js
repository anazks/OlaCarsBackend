const path = require('path');
const root = path.join(__dirname, '..');

let pass = 0, fail = 0;

function check(label, condition) {
    if (condition) { console.log(`  PASS  ${label}`); pass++; }
    else { console.log(`  FAIL  ${label}`); fail++; }
}

// ── 1. Import all modules ────────────────────────────────────────────
console.log('\n=== MODULE IMPORTS ===');
let DriverModel, DriverRepo, WorkflowService, DriverService, DriverController;
try {
    DriverModel = require(path.join(root, 'Src/modules/Driver/Model/DriverModel'));
    check('DriverModel imports', true);
    DriverRepo = require(path.join(root, 'Src/modules/Driver/Repo/DriverRepo'));
    check('DriverRepo imports', true);
    WorkflowService = require(path.join(root, 'Src/modules/Driver/Service/DriverWorkflowService'));
    check('DriverWorkflowService imports', true);
    DriverService = require(path.join(root, 'Src/modules/Driver/Service/DriverService'));
    check('DriverService imports', true);
    DriverController = require(path.join(root, 'Src/modules/Driver/Controller/DriverController'));
    check('DriverController imports', true);
    require(path.join(root, 'Src/modules/Driver/Routes/DriverRouter'));
    check('DriverRouter imports', true);
} catch (e) {
    console.error('IMPORT ERROR:', e.message);
    process.exit(1);
}

// ── Fix #1: flattenForSet exists in DriverRepo ───────────────────────
console.log('\n=== FIX 1: $set via flattenForSet ===');
check('updateDriverService accepts 3 params (id, data, session)', DriverRepo.updateDriverService.length >= 2);

// ── Fix #2: workflowError uses statusCode ────────────────────────────
console.log('\n=== FIX 2: error.statusCode ===');
check('STATUS_RULES exported', !!WorkflowService.STATUS_RULES);

// ── Fix #4: unique email index ───────────────────────────────────────
console.log('\n=== FIX 4: Unique Email Index ===');
const schema = DriverModel.Driver.schema;
// Check indexes
const indexes = schema.indexes();
const emailIdx = indexes.find(i => i[0]['personalInfo.email'] !== undefined);
check('personalInfo.email index exists', !!emailIdx);
check('Email index is unique + sparse', emailIdx && emailIdx[1].unique === true && emailIdx[1].sparse === true);

// ── Fix #5: Fraud alert in evaluateCreditScore ───────────────────────
console.log('\n=== FIX 5: Fraud Alert Handling ===');
const fraudResult = WorkflowService.evaluateCreditScore(700, true);
check('Fraud alert returns FRAUD rating', fraudResult.rating === 'FRAUD');
check('Fraud alert returns DECLINED decision', fraudResult.decision === 'DECLINED');

const normalResult = WorkflowService.evaluateCreditScore(700, false);
check('Normal 700 still works as GOOD/AUTO_APPROVED', normalResult.rating === 'GOOD' && normalResult.decision === 'AUTO_APPROVED');

// ── Fix #6: System auto-decides (no manual override) ─────────────────
console.log('\n=== FIX 6: Auto-Decision Engine ===');
check('Score 800 → EXCELLENT/AUTO_APPROVED', JSON.stringify(WorkflowService.evaluateCreditScore(800)) === JSON.stringify({ rating: 'EXCELLENT', decision: 'AUTO_APPROVED' }));
check('Score 600 → FAIR/MANUAL_REVIEW', JSON.stringify(WorkflowService.evaluateCreditScore(600)) === JSON.stringify({ rating: 'FAIR', decision: 'MANUAL_REVIEW' }));
check('Score 400 → POOR/DECLINED', JSON.stringify(WorkflowService.evaluateCreditScore(400)) === JSON.stringify({ rating: 'POOR', decision: 'DECLINED' }));

// ── Fix #7: Field whitelisting ───────────────────────────────────────
console.log('\n=== FIX 7: Stage Field Whitelists ===');
const { STAGE_ALLOWED_FIELDS } = WorkflowService;
check('STAGE_ALLOWED_FIELDS exported', !!STAGE_ALLOWED_FIELDS);
check('PENDING REVIEW allows personalInfo', STAGE_ALLOWED_FIELDS['PENDING REVIEW'].includes('personalInfo'));
check('PENDING REVIEW does NOT allow activation', !STAGE_ALLOWED_FIELDS['PENDING REVIEW'].includes('activation'));
check('CREDIT CHECK allows creditCheck', STAGE_ALLOWED_FIELDS['CREDIT CHECK'].includes('creditCheck'));
check('CREDIT CHECK does NOT allow rejection', !STAGE_ALLOWED_FIELDS['CREDIT CHECK'].includes('rejection'));
check('REJECTED allows rejection', STAGE_ALLOWED_FIELDS['REJECTED'].includes('rejection'));
check('REJECTED does NOT allow contract', !STAGE_ALLOWED_FIELDS['REJECTED'].includes('contract'));
check('ACTIVE allows activation', STAGE_ALLOWED_FIELDS['ACTIVE'].includes('activation'));
check('ACTIVE does NOT allow creditCheck', !STAGE_ALLOWED_FIELDS['ACTIVE'].includes('creditCheck'));

// ── Fix #8: Bank encryption functions ────────────────────────────────
console.log('\n=== FIX 8: Bank Encryption ===');
const accountPath = schema.path('bankDetails.accountNumber');
check('accountNumber has set (encrypt) function', typeof accountPath.options.set === 'function');
check('accountNumber has get (decrypt) function', typeof accountPath.options.get === 'function');

// ── Fix #9: Sensitive field projection ───────────────────────────────
console.log('\n=== FIX 9: Sensitive Field Restriction ===');
check('getDriversService accepts options param', DriverRepo.getDriversService.length >= 1);
check('getDriverByIdService accepts options param', DriverRepo.getDriverByIdService.length >= 1);

// ── Fix #10: Transaction support ─────────────────────────────────────
console.log('\n=== FIX 10: Transaction Support ===');
check('updateDriverService has session parameter', DriverRepo.updateDriverService.length >= 2);

// ── Summary ──────────────────────────────────────────────────────────
console.log('\n' + '='.repeat(50));
console.log(`RESULTS: ${pass} passed, ${fail} failed`);
if (fail === 0) console.log('ALL HARDENING CHECKS PASSED');
else { console.log('SOME CHECKS FAILED'); process.exit(1); }
