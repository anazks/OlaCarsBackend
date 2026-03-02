---
phase: 2
plan: 1
wave: 1
---

# Plan 2.1: Update STATUS_RULES for New Statuses

## Objective
Extend the `VehicleWorkflowService.js` state machine with transition rules, gate validators, and side effects for the 4 new statuses (INSURANCE VERIFICATION, SUSPENDED, TRANSFER PENDING, TRANSFER COMPLETE) and update existing rules to reflect the v3.0 flow.

## Context
- .gsd/SPEC.md (§4 Transition Matrix, §5 Rejection Loops, §7 Gate Validators, §8 Side Effects)
- Src/modules/Vehicle/Service/VehicleWorkflowService.js
- Src/modules/Vehicle/Model/VehicleModel.js
- Src/shared/constants/roles.js

## Tasks

<task type="auto">
  <name>Update existing STATUS_RULES and add INSURANCE VERIFICATION</name>
  <files>Src/modules/Vehicle/Service/VehicleWorkflowService.js</files>
  <action>
    1. **Modify "DOCUMENTS REVIEW" rule:**
       - Change `allowedFrom` from `["PENDING ENTRY", "INSPECTION REQUIRED"]` to `["PENDING ENTRY", "INSURANCE VERIFICATION"]`
       - (Insurance rejection loop: INSURANCE VERIFICATION can reject back to DOCUMENTS REVIEW)

    2. **Add "INSURANCE VERIFICATION" rule:**
       ```javascript
       "INSURANCE VERIFICATION": {
           allowedFrom: ["DOCUMENTS REVIEW"],
           allowedRoles: [ROLES.OPERATIONSTAFF, ROLES.FINANCESTAFF],
           minHierarchy: ROLES.BRANCHMANAGER,
           gateValidator: (vehicle, payload) => {
               const insurance = { ...vehicle.insurancePolicy, ...payload.insurancePolicy };
               if (!insurance.insuranceType || !insurance.providerName || !insurance.policyNumber || !insurance.startDate || !insurance.expiryDate) {
                   return "Insurance policy details are incomplete. Type, provider, policy number, start and expiry dates are all required.";
               }
               return null;
           }
       },
       ```

    3. **Modify "INSPECTION REQUIRED" rule:**
       - Change `allowedFrom` from `["DOCUMENTS REVIEW", "REPAIR IN PROGRESS"]` to `["INSURANCE VERIFICATION", "REPAIR IN PROGRESS"]`

    4. **Modify "ACCOUNTING SETUP" rule:**
       - Change `allowedFrom` from `["INSPECTION REQUIRED", "REPAIR IN PROGRESS"]` to `["INSPECTION REQUIRED"]`
       - Add gateValidator:
       ```javascript
       gateValidator: (vehicle, payload) => {
           const inspection = { ...vehicle.inspection, ...payload.inspection };
           if (inspection.status !== "Passed") {
               return "Vehicle did not pass inspection.";
           }
           return null;
       }
       ```

    5. **Add "INSPECTION FAILED" to SYSTEM_STATUSES array** (auto-detected, not manually triggered):
       ```javascript
       const SYSTEM_STATUSES = ["ACTIVE — RENTED", "INSPECTION FAILED"];
       ```
  </action>
  <verify>node -e "const { STATUS_RULES } = require('./Src/modules/Vehicle/Service/VehicleWorkflowService'); console.log('INSURANCE VERIFICATION:', !!STATUS_RULES['INSURANCE VERIFICATION']); console.log('INSPECTION from:', STATUS_RULES['INSPECTION REQUIRED'].allowedFrom); console.log('DOCS from:', STATUS_RULES['DOCUMENTS REVIEW'].allowedFrom);"</verify>
  <done>INSURANCE VERIFICATION rule exists. INSPECTION REQUIRED allows from INSURANCE VERIFICATION. DOCUMENTS REVIEW allows from INSURANCE VERIFICATION (rejection loop). ACCOUNTING SETUP gates on inspection passed.</done>
</task>

<task type="auto">
  <name>Add STATUS_RULES for SUSPENDED, TRANSFER PENDING, TRANSFER COMPLETE</name>
  <files>Src/modules/Vehicle/Service/VehicleWorkflowService.js</files>
  <action>
    Add the following 3 new STATUS_RULES entries before the "RETIRED" rule:

    1. **SUSPENDED:**
       ```javascript
       "SUSPENDED": {
           allowedFrom: ["ACTIVE — AVAILABLE", "ACTIVE — RENTED", "ACTIVE — MAINTENANCE"],
           allowedRoles: [ROLES.BRANCHMANAGER],
           minHierarchy: ROLES.COUNTRYMANAGER,
           gateValidator: (vehicle, payload) => {
               const suspension = payload.suspensionDetails || {};
               if (!suspension.reason) {
                   return "Suspension reason is required.";
               }
               return null;
           }
       },
       ```

    2. **TRANSFER PENDING:**
       ```javascript
       "TRANSFER PENDING": {
           allowedFrom: ["ACTIVE — AVAILABLE"],
           allowedRoles: [ROLES.BRANCHMANAGER],
           minHierarchy: ROLES.COUNTRYMANAGER,
           gateValidator: (vehicle, payload) => {
               const transfer = payload.transferDetails || {};
               if (!transfer.toBranch) {
                   return "Destination branch is required for transfer.";
               }
               const currentBranch = vehicle.purchaseDetails?.branch?.toString();
               if (transfer.toBranch.toString() === currentBranch) {
                   return "Destination branch must be different from current branch.";
               }
               return null;
           }
       },
       ```

    3. **TRANSFER COMPLETE:**
       ```javascript
       "TRANSFER COMPLETE": {
           allowedFrom: ["TRANSFER PENDING"],
           allowedRoles: [ROLES.BRANCHMANAGER],
           minHierarchy: ROLES.COUNTRYMANAGER,
       },
       ```

    4. **Update "ACTIVE — AVAILABLE" rule:**
       - Add `"TRANSFER COMPLETE"` and `"SUSPENDED"` to `allowedFrom`:
       ```javascript
       allowedFrom: ["BRANCH MANAGER APPROVAL", "ACTIVE — RENTED", "ACTIVE — MAINTENANCE", "TRANSFER COMPLETE", "SUSPENDED"],
       ```

    5. **Update "RETIRED" rule:**
       - Add `"SUSPENDED"` to `allowedFrom`:
       ```javascript
       allowedFrom: ["ACTIVE — AVAILABLE", "ACTIVE — MAINTENANCE", "SUSPENDED"],
       ```
       - Remove `"ACTIVE — RENTED"` (a rented vehicle must be returned or suspended first before retirement)
  </action>
  <verify>node -e "const { STATUS_RULES } = require('./Src/modules/Vehicle/Service/VehicleWorkflowService'); console.log('SUSPENDED:', !!STATUS_RULES['SUSPENDED']); console.log('TRANSFER PENDING:', !!STATUS_RULES['TRANSFER PENDING']); console.log('TRANSFER COMPLETE:', !!STATUS_RULES['TRANSFER COMPLETE']); console.log('AVAILABLE from:', STATUS_RULES['ACTIVE — AVAILABLE'].allowedFrom);"</verify>
  <done>All 3 new rules exist. ACTIVE — AVAILABLE accepts from TRANSFER COMPLETE and SUSPENDED. RETIRED accepts from SUSPENDED. All gate validators functional.</done>
</task>

<task type="auto">
  <name>Update triggerExternalActions and processVehicleProgress for new flows</name>
  <files>Src/modules/Vehicle/Service/VehicleWorkflowService.js</files>
  <action>
    1. **Update `triggerExternalActions`** — add handlers for new transitions:
       ```javascript
       } else if (targetStatus === "SUSPENDED") {
           console.log(`[Event Action] Vehicle ${vehicleId} suspended. Previous status captured for restoration.`);
       } else if (targetStatus === "TRANSFER PENDING") {
           console.log(`[Event Action] Transfer initiated for Vehicle ${vehicleId}. Notifying destination branch...`);
       } else if (targetStatus === "RETIRED") {
           console.log(`[Event Action] Vehicle ${vehicleId} retired. Triggering final depreciation entry and archival...`);
       }
       ```

    2. **Update `processVehicleProgress`** — add logic for:
       a. **Suspension previousStatus capture** — before setting `payload.status`, if targetStatus is "SUSPENDED":
          ```javascript
          if (targetStatus === "SUSPENDED") {
              payload.suspensionDetails = payload.suspensionDetails || {};
              payload.suspensionDetails.previousStatus = currentVehicle.status;
          }
          ```

       b. **Transfer auto-populate fromBranch** — if targetStatus is "TRANSFER PENDING":
          ```javascript
          if (targetStatus === "TRANSFER PENDING") {
              payload.transferDetails = payload.transferDetails || {};
              payload.transferDetails.fromBranch = currentVehicle.purchaseDetails?.branch;
              payload.transferDetails.initiatedBy = user.id;
              payload.transferDetails.initiatedByRole = user.role;
              payload.transferDetails.transferDate = new Date();
          }
          ```

       c. **Transfer complete branch reassignment** — if transitioning from TRANSFER COMPLETE to ACTIVE — AVAILABLE:
          ```javascript
          if (targetStatus === "ACTIVE — AVAILABLE" && currentVehicle.status === "TRANSFER COMPLETE") {
              payload["purchaseDetails.branch"] = currentVehicle.transferDetails?.toBranch;
          }
          ```

       d. **Inspection auto-fail detection** — when transitioning to INSPECTION REQUIRED, after saving, check checklist for mandatory failures:
          ```javascript
          // After update, check for auto-fail
          if (targetStatus === "INSPECTION REQUIRED") {
              const hasMandatoryFail = updatedVehicle.inspection?.checklistItems?.some(
                  item => item.condition === "Poor" && item.isMandatoryFail
              );
              if (hasMandatoryFail) {
                  updatedVehicle.inspection.status = "Failed";
                  updatedVehicle.status = "INSPECTION FAILED";
                  updatedVehicle.statusHistory.push({
                      status: "INSPECTION FAILED",
                      changedBy: user.id,
                      changedByRole: user.role,
                      notes: "Auto-failed: mandatory inspection item(s) rated Poor.",
                  });
                  await updatedVehicle.save();
              } else {
                  updatedVehicle.inspection.status = "Passed";
                  await updatedVehicle.save();
              }
          }
          ```
  </action>
  <verify>node -e "const { processVehicleProgress } = require('./Src/modules/Vehicle/Service/VehicleWorkflowService'); console.log('processVehicleProgress is function:', typeof processVehicleProgress === 'function');"</verify>
  <done>triggerExternalActions handles SUSPENDED, TRANSFER PENDING, RETIRED. processVehicleProgress captures previousStatus on suspension, auto-populates fromBranch on transfer, reassigns branch on transfer complete, and auto-detects inspection failures.</done>
</task>

## Success Criteria
- [ ] STATUS_RULES has entries for all 16 statuses
- [ ] Gate validators exist for: INSURANCE VERIFICATION, SUSPENDED, TRANSFER PENDING, ACCOUNTING SETUP
- [ ] triggerExternalActions handles new transitions
- [ ] processVehicleProgress handles suspension capture, transfer auto-populate, branch reassignment, and inspection auto-fail
- [ ] Module loads without errors
