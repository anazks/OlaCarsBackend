---
phase: 1
plan: 1
wave: 1
---

# Plan 1.1: Add New Statuses & Schema Fields to VehicleModel

## Objective
Update `VehicleModel.js` to support all 16 vehicle statuses and add new schema sections for suspension, transfer, retirement, and maintenance tracking as defined in SPEC.md v3.0 §3.1, §12.

## Context
- .gsd/SPEC.md (§3.1 Status Definitions, §12 Model Changes Required)
- Src/modules/Vehicle/Model/VehicleModel.js

## Tasks

<task type="auto">
  <name>Add 4 new status values to VEHICLE_STATUSES array</name>
  <files>Src/modules/Vehicle/Model/VehicleModel.js</files>
  <action>
    Add the following 4 new values to the `VEHICLE_STATUSES` array, inserted in logical pipeline order:
    - "INSURANCE VERIFICATION" — after "DOCUMENTS REVIEW" (index 2)
    - "SUSPENDED" — after "ACTIVE — MAINTENANCE" (index 14)
    - "TRANSFER PENDING" — after "SUSPENDED" (index 15)
    - "TRANSFER COMPLETE" — after "TRANSFER PENDING" (index 16)

    Final VEHICLE_STATUSES array should be 16 items:
    ```
    PENDING ENTRY, DOCUMENTS REVIEW, INSURANCE VERIFICATION, INSPECTION REQUIRED,
    INSPECTION FAILED, REPAIR IN PROGRESS, ACCOUNTING SETUP, GPS ACTIVATION,
    BRANCH MANAGER APPROVAL, ACTIVE — AVAILABLE, ACTIVE — RENTED,
    ACTIVE — MAINTENANCE, SUSPENDED, TRANSFER PENDING, TRANSFER COMPLETE, RETIRED
    ```

    Do NOT change the existing status strings — they must remain identical.
  </action>
  <verify>node -e "const { VEHICLE_STATUSES } = require('./Src/modules/Vehicle/Model/VehicleModel'); console.log(VEHICLE_STATUSES.length, VEHICLE_STATUSES);"</verify>
  <done>VEHICLE_STATUSES array has exactly 16 items, all spelled correctly.</done>
</task>

<task type="auto">
  <name>Add new schema sections for suspension, transfer, retirement, maintenance</name>
  <files>Src/modules/Vehicle/Model/VehicleModel.js</files>
  <action>
    Add the following 4 new nested schema sections to `vehicleSchema`, placed after `gpsConfiguration` and before `createdBy`:

    1. **suspensionDetails** (after gpsConfiguration):
       - reason: String, enum ["Accident", "Legal", "Police", "Dispute", "Other"]
       - suspendedUntil: Date (optional, timed suspensions)
       - previousStatus: String, enum VEHICLE_STATUSES (captured by engine for restoration)

    2. **transferDetails**:
       - fromBranch: ObjectId, ref "Branch"
       - toBranch: ObjectId, ref "Branch"
       - reason: String
       - estimatedArrival: Date
       - transportMethod: String, enum ["Driven", "Flatbed", "Shipping"]
       - initiatedBy: ObjectId, refPath "transferDetails.initiatedByRole"
       - initiatedByRole: String
       - transferDate: Date

    3. **retirementDetails**:
       - reason: String, enum ["Sold", "Written Off", "End of Life", "Beyond Repair"]
       - disposalDate: Date
       - disposalValue: Number

    4. **maintenanceDetails**:
       - type: String, enum ["Scheduled", "Unscheduled", "Emergency"]
       - estimatedCompletionDate: Date
       - assignedTo: ObjectId, refPath "maintenanceDetails.assignedToRole"
       - assignedToRole: String

    Also add 3 new indexes AFTER existing indexes:
    ```javascript
    vehicleSchema.index({ "insurancePolicy.expiryDate": 1 });
    vehicleSchema.index({ "legalDocs.registrationExpiry": 1 });
    vehicleSchema.index({ "legalDocs.roadTaxExpiry": 1 });
    ```
  </action>
  <verify>node -e "const { Vehicle } = require('./Src/modules/Vehicle/Model/VehicleModel'); const paths = Object.keys(Vehicle.schema.paths); console.log('Has suspensionDetails:', paths.some(p => p.startsWith('suspensionDetails'))); console.log('Has transferDetails:', paths.some(p => p.startsWith('transferDetails'))); console.log('Has retirementDetails:', paths.some(p => p.startsWith('retirementDetails'))); console.log('Has maintenanceDetails:', paths.some(p => p.startsWith('maintenanceDetails')));"</verify>
  <done>All 4 new schema sections exist with correct field types. 3 new indexes added. Server starts without errors.</done>
</task>

## Success Criteria
- [ ] VEHICLE_STATUSES has exactly 16 values
- [ ] 4 new schema sections (suspensionDetails, transferDetails, retirementDetails, maintenanceDetails) exist
- [ ] 3 new expiry-related indexes added
- [ ] Server starts cleanly: `node -e "require('./Src/modules/Vehicle/Model/VehicleModel');"` exits with 0
