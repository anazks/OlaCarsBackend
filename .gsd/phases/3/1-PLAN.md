---
phase: 3
plan: 1
wave: 2
---

# Plan 3.1: Update Controller & Swagger Documentation

## Objective
Update `VehicleController.js` to handle new `updateData` payloads and update `VehicleRouter.js` Swagger schemas to document all 16 statuses and new fields.

## Context
- .gsd/SPEC.md (§6 API Endpoints, §6.2 Per-Stage Payloads)
- Src/modules/Vehicle/Controller/VehicleController.js
- Src/modules/Vehicle/Routes/VehicleRouter.js
- Src/modules/Vehicle/Model/VehicleModel.js

## Tasks

<task type="auto">
  <name>Update VehicleController for new payloads</name>
  <files>Src/modules/Vehicle/Controller/VehicleController.js</files>
  <action>
    The existing `progressVehicleStatus` controller already passes `targetStatus` and `updateData` to the workflow service, so it handles all new payloads (suspension, transfer, retirement, maintenance) without modification.

    However, add input sanitization to ensure `notes` from the top-level request body is merged into `updateData`:

    ```javascript
    const progressVehicleStatus = async (req, res) => {
        try {
            const vehicleId = req.params.id;
            const { targetStatus, updateData, notes } = req.body;
            const user = req.user;

            // Merge top-level notes into updateData
            const payload = { ...updateData };
            if (notes) payload.notes = notes;

            const updatedVehicle = await processVehicleProgress(vehicleId, targetStatus, payload, user);

            return res.status(200).json({ success: true, data: updatedVehicle });
        } catch (error) {
            const statusCode = error.cause || 500;
            return res.status(statusCode).json({ success: false, message: error.message });
        }
    };
    ```
  </action>
  <verify>node -e "const c = require('./Src/modules/Vehicle/Controller/VehicleController'); console.log('exports:', Object.keys(c));"</verify>
  <done>Controller handles `notes` field from request body and passes it through to the workflow engine.</done>
</task>

<task type="auto">
  <name>Update Swagger schemas in VehicleRouter</name>
  <files>Src/modules/Vehicle/Routes/VehicleRouter.js</files>
  <action>
    Update the Swagger documentation for `PUT /api/vehicle/:id/progress` to include:

    1. **Updated status enum** — List all 16 statuses in the `targetStatus` schema property.

    2. **updateData schema** — Document all possible nested objects:
       - `legalDocs` (for DOCUMENTS REVIEW transition)
       - `insurancePolicy` (for INSURANCE VERIFICATION transition)
       - `importationDetails` (optional, with INSURANCE VERIFICATION)
       - `inspection` (for INSPECTION REQUIRED transition)
       - `accountingSetup` (for ACCOUNTING SETUP transition)
       - `gpsConfiguration` (for GPS ACTIVATION transition)
       - `suspensionDetails` with `reason` enum (for SUSPENDED transition)
       - `transferDetails` with `toBranch`, `transportMethod` (for TRANSFER PENDING)
       - `retirementDetails` with `reason` enum (for RETIRED transition)
       - `maintenanceDetails` with `type` enum (for ACTIVE — MAINTENANCE)

    3. **notes** — Top-level string field for transition notes.

    Also update the `POST /api/vehicle/` Swagger to include the full model schema including new sections.
  </action>
  <verify>Open VehicleRouter.js and visually confirm Swagger annotations include all 16 statuses and new schema fields.</verify>
  <done>Swagger docs cover all 16 statuses, all updateData nested objects, and the notes field.</done>
</task>

## Success Criteria
- [ ] Controller correctly merges `notes` into `updateData`
- [ ] Swagger documents all 16 statuses
- [ ] Swagger documents all new schema sections (suspension, transfer, retirement, maintenance)
- [ ] Server starts and Swagger UI renders correctly
