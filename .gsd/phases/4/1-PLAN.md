---
phase: 4
plan: 1
wave: 3
---

# Plan 4.1: End-to-End Workflow Verification

## Objective
Validate the full vehicle onboarding pipeline and fleet lifecycle transitions against SPEC.md v3.0, verifying happy paths, rejection loops, role enforcement, and gate validators.

## Context
- .gsd/SPEC.md (§4 Transition Matrix, §5 Rejection Loops, §7 Gate Validators)
- Src/modules/Vehicle/Service/VehicleWorkflowService.js
- Src/modules/Vehicle/Controller/VehicleController.js
- Src/modules/Vehicle/Routes/VehicleRouter.js

## Tasks

<task type="auto">
  <name>Verify happy path: full 10-stage onboarding</name>
  <files>Src/modules/Vehicle/Service/VehicleWorkflowService.js</files>
  <action>
    Using the server's API (or direct service calls if API testing is too complex), verify:

    1. Create vehicle → status = PENDING ENTRY
    2. Progress to DOCUMENTS REVIEW (with 3 mandatory docs) → success
    3. Progress to INSURANCE VERIFICATION (with insurance details) → success
    4. Progress to INSPECTION REQUIRED (with 23 items + 6 photos + odometer) → success (all pass)
    5. Progress to ACCOUNTING SETUP → success
    6. Progress to GPS ACTIVATION (isSetupComplete = true) → success
    7. Progress to BRANCH MANAGER APPROVAL (isActivated = true) → success
    8. Progress to ACTIVE — AVAILABLE → success

    Log each transition result.
  </action>
  <verify>All 8 transitions complete without error. Vehicle ends in ACTIVE — AVAILABLE.</verify>
  <done>Full happy path completes successfully through all 10 onboarding stages.</done>
</task>

<task type="auto">
  <name>Verify rejection loops and gate validators</name>
  <files>Src/modules/Vehicle/Service/VehicleWorkflowService.js</files>
  <action>
    Test the following failure scenarios:

    1. **Document rejection:** Try DOCUMENTS REVIEW without registrationCertificate → expect error
    2. **Insurance incomplete:** Try INSURANCE VERIFICATION without policyNumber → expect error
    3. **Inspection auto-fail:** Submit inspection with a mandatory Poor item → expect auto-transition to INSPECTION FAILED
    4. **Repair → re-inspect loop:** INSPECTION FAILED → REPAIR IN PROGRESS → INSPECTION REQUIRED → succeeds
    5. **GPS gate:** Try BRANCH MANAGER APPROVAL without isActivated → expect error
    6. **Accounting gate:** Try GPS ACTIVATION without isSetupComplete → expect error
    7. **Transfer gate:** Try TRANSFER PENDING without toBranch → expect error
    8. **Transfer same branch:** Try TRANSFER PENDING with toBranch = current branch → expect error
    9. **Suspension gate:** Try SUSPENDED without reason → expect error
    10. **Retirement gate:** Try RETIRED without reason → expect error

    Log each result clearly: PASS or FAIL with error message.
  </action>
  <verify>All 10 gate validator tests produce expected errors. All rejection loops work correctly.</verify>
  <done>Gate validators block invalid transitions. Rejection loops cycle correctly.</done>
</task>

<task type="checkpoint:human-verify">
  <name>Visual inspection of Swagger UI</name>
  <files>Src/modules/Vehicle/Routes/VehicleRouter.js</files>
  <action>
    Start the server and open Swagger UI. User visually confirms:
    1. All 16 statuses appear in the progress endpoint schema
    2. New schema sections (suspension, transfer, retirement, maintenance) are documented
    3. All endpoints render correctly
  </action>
  <verify>User opens Swagger UI at /api-docs and confirms documentation is complete.</verify>
  <done>User confirms Swagger documentation is accurate and complete.</done>
</task>

## Success Criteria
- [ ] Full onboarding happy path (10 stages) completes end-to-end
- [ ] All 10 gate validator scenarios produce correct errors
- [ ] Document rejection and inspection fail loops work
- [ ] Transfer flow works (PENDING → COMPLETE → AVAILABLE with branch reassignment)
- [ ] Suspension flow works (capture previousStatus, restore to AVAILABLE)
- [ ] Swagger UI renders all 16 statuses and new fields
