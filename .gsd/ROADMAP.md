# Execution Roadmap: Vehicle Onboarding & Fleet Lifecycle

Based on `SPEC.md v3.0` (FINALIZED). Unified progress endpoint architecture.

---

## Phase 1: Model Foundation
Update `VehicleModel.js` to support all 16 statuses and new schema fields.

**Deliverables:**
- Add 4 new status values: `INSURANCE VERIFICATION`, `SUSPENDED`, `TRANSFER PENDING`, `TRANSFER COMPLETE`
- Add new schema sections: `suspensionDetails`, `transferDetails`, `retirementDetails`, `maintenanceDetails`
- Add new database indexes for expiry date queries
- Verify model compiles and server starts cleanly

---

## Phase 2: Workflow Engine
Update `VehicleWorkflowService.js` state machine for all 16 statuses.

**Deliverables:**
- Add STATUS_RULES for 4 new statuses (INSURANCE VERIFICATION, SUSPENDED, TRANSFER PENDING, TRANSFER COMPLETE)
- Update existing rules: DOCUMENTS REVIEW → INSURANCE VERIFICATION → INSPECTION REQUIRED flow
- Add new gate validators (insurance completeness, suspension reason, transfer destination, retirement reason)
- Update `triggerExternalActions` for new transitions (branch reassignment on transfer, previousStatus capture on suspension)
- Add `INSPECTION FAILED` to SYSTEM_STATUSES (auto-detected)

---

## Phase 3: API & Documentation
Update controller, routes, and Swagger for the enhanced workflow.

**Deliverables:**
- Update `VehicleController.js` to handle new `updateData` payloads (suspension, transfer, retirement, maintenance details)
- Update `VehicleRouter.js` Swagger schemas to document all 16 statuses and new fields
- Ensure upload-documents endpoint covers all supported file fields

---

## Phase 4: End-to-End Verification
Validate the full onboarding pipeline + fleet lifecycle.

**Deliverables:**
- Test full happy path: PENDING ENTRY → ... → ACTIVE — AVAILABLE (all 10 stages)
- Test rejection loops: Document rejection, insurance rejection, inspection fail → repair → re-inspect
- Test fleet lifecycle: maintenance, suspension, transfer, retirement flows
- Test role-based access: verify unauthorized roles are blocked
- Test gate validators: verify incomplete data is rejected
