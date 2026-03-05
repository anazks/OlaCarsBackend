# Vehicle Onboarding — Frontend Integration Guide

> Complete stage-by-stage API reference for building the vehicle onboarding flow.

---

## Base URL & Auth

All endpoints require a **Bearer token** in the `Authorization` header.

```
Authorization: Bearer <accessToken>
```

> **Branch-level roles** (BranchManager, OperationStaff, FinanceStaff, WorkshopStaff) have `branchId` auto-injected from the token. Admin/CountryManager must specify `purchaseDetails.branch` explicitly.

---

## Endpoints Summary

| Action | Method | Endpoint |
|--------|--------|----------|
| Create Vehicle | `POST` | `/api/vehicle` |
| Get All Vehicles | `GET` | `/api/vehicle` |
| Get Vehicle by ID | `GET` | `/api/vehicle/:id` |
| Progress Status | `PUT` | `/api/vehicle/:id/progress` |
| Upload Documents | `POST` | `/api/vehicle/:id/upload-documents` |
| Get Vehicle POs | `GET` | `/api/purchase-order?purpose=Vehicle` |

---

## Workflow Diagram

```
PENDING ENTRY → DOCUMENTS REVIEW → INSURANCE VERIFICATION → INSPECTION REQUIRED
                                                                    │
                                                          ┌─── Passed ───┐
                                                          ▼              │
                                                   ACCOUNTING SETUP     │
                                                          │        INSPECTION FAILED
                                                          ▼              │
                                                    GPS ACTIVATION  REPAIR IN PROGRESS
                                                          │              │
                                                          ▼              │
                                                BRANCH MANAGER APPROVAL  │
                                                          │    (loops back to INSPECTION)
                                                          ▼
                                                  ACTIVE — AVAILABLE
```

---

## Stage-by-Stage Guide

---

### Stage 0 — Get Vehicle Purchase Orders

Before creating a vehicle, fetch approved Vehicle POs to link.

**`GET /api/purchase-order?purpose=Vehicle`**

Returns only `APPROVED` POs with `purpose: "Vehicle"`, scoped by role.

---

### Stage 1 — Create Vehicle (`PENDING ENTRY`)

**`POST /api/vehicle`**

Creates a new vehicle record in `PENDING ENTRY` status.

> **Note:** `branch` is auto-set from token for branch-level roles.

```json
{
  "purchaseDetails": {
    "purchaseOrder": "PO_OBJECT_ID",
    "vendorName": "ABC Motors",
    "purchaseDate": "2026-01-15T00:00:00.000Z",
    "purchasePrice": 25000,
    "currency": "USD",
    "paymentMethod": "Bank Transfer",
    "branch": "BRANCH_OBJECT_ID"
  },
  "basicDetails": {
    "make": "Toyota",
    "model": "Corolla",
    "year": 2026,
    "category": "Sedan",
    "fuelType": "Petrol",
    "transmission": "Automatic",
    "engineCapacity": 1800,
    "colour": "White",
    "seats": 5,
    "vin": "JTDKN3DU5A0123456",
    "engineNumber": "ENG123456",
    "bodyType": "Saloon",
    "odometer": 0
  }
}
```

**Required fields:** `basicDetails.make`, `basicDetails.model`, `basicDetails.year`, `basicDetails.vin`, `purchaseDetails.branch`

---

### Stage 2 — Documents Review (`DOCUMENTS REVIEW`)

First, upload documents via the upload endpoint, then progress the status.

#### Step 2a — Upload Legal Documents

**`POST /api/vehicle/:id/upload-documents`** (`multipart/form-data`)

| Field Name | Type | Required |
|-----------|------|----------|
| `registrationCertificate` | file | ✅ |
| `roadTaxDisc` | file | ✅ |
| `roadworthinessCertificate` | file | ✅ |
| `numberPlateFront` | file | Optional |
| `numberPlateRear` | file | Optional |
| `transferOfOwnership` | file | Optional |
| `purchaseReceipt` | file | Optional |

#### Step 2b — Progress to DOCUMENTS REVIEW

**`PUT /api/vehicle/:id/progress`**

```json
{
  "targetStatus": "DOCUMENTS REVIEW",
  "updateData": {
    "legalDocs": {
      "registrationNumber": "KAA 123A",
      "registrationExpiry": "2027-01-15T00:00:00.000Z",
      "roadTaxExpiry": "2027-06-30T00:00:00.000Z",
      "roadworthinessExpiry": "2027-01-15T00:00:00.000Z"
    }
  },
  "notes": "All documents uploaded and verified"
}
```

> **Gate:** `registrationCertificate`, `roadTaxDisc`, and `roadworthinessCertificate` file URLs must exist on the vehicle record.

**Allowed roles:** OperationStaff, BranchManager+

---

### Stage 3 — Insurance Verification (`INSURANCE VERIFICATION`)

**`PUT /api/vehicle/:id/progress`**

```json
{
  "targetStatus": "INSURANCE VERIFICATION",
  "updateData": {
    "insurancePolicy": {
      "insuranceType": "Comprehensive",
      "providerName": "AIG Insurance",
      "policyNumber": "POL-2026-00123",
      "startDate": "2026-01-01T00:00:00.000Z",
      "expiryDate": "2027-01-01T00:00:00.000Z",
      "premiumAmount": 1200,
      "coverageAmount": 50000,
      "excessAmount": 500,
      "namedDrivers": ["John Doe", "Jane Smith"],
      "claimsHistory": "None"
    }
  },
  "notes": "Insurance verified with provider"
}
```

> **Gate:** `insuranceType`, `providerName`, `policyNumber`, `startDate`, `expiryDate` are all required.

**Upload insurance doc first:**
`POST /api/vehicle/:id/upload-documents` with field `policyDocument`

**Allowed roles:** OperationStaff, FinanceStaff, BranchManager+

---

### Stage 4 — Inspection (`INSPECTION REQUIRED`)

**`PUT /api/vehicle/:id/progress`**

```json
{
  "targetStatus": "INSPECTION REQUIRED",
  "updateData": {
    "inspection": {
      "checkedBy": "STAFF_OBJECT_ID",
      "checkedByRole": "OPERATIONSTAFF",
      "date": "2026-02-01T00:00:00.000Z",
      "checklistItems": [
        { "name": "Engine Oil Level", "condition": "Good", "isMandatoryFail": true },
        { "name": "Brake Fluid Level", "condition": "Good", "isMandatoryFail": true },
        { "name": "Coolant Level", "condition": "Good", "isMandatoryFail": true },
        { "name": "Transmission Fluid", "condition": "Good", "isMandatoryFail": false },
        { "name": "Power Steering Fluid", "condition": "Good", "isMandatoryFail": false },
        { "name": "Windshield Washer Fluid", "condition": "Good", "isMandatoryFail": false },
        { "name": "Battery Condition", "condition": "Good", "isMandatoryFail": true },
        { "name": "Tire Pressure FL", "condition": "Good", "isMandatoryFail": true },
        { "name": "Tire Pressure FR", "condition": "Good", "isMandatoryFail": true },
        { "name": "Tire Pressure RL", "condition": "Good", "isMandatoryFail": true },
        { "name": "Tire Pressure RR", "condition": "Good", "isMandatoryFail": true },
        { "name": "Tire Tread Depth", "condition": "Good", "isMandatoryFail": true },
        { "name": "Headlights", "condition": "Good", "isMandatoryFail": true },
        { "name": "Tail Lights", "condition": "Good", "isMandatoryFail": true },
        { "name": "Turn Signals", "condition": "Good", "isMandatoryFail": true },
        { "name": "Brake Lights", "condition": "Good", "isMandatoryFail": true },
        { "name": "Horn", "condition": "Good", "isMandatoryFail": true },
        { "name": "Windshield Wipers", "condition": "Good", "isMandatoryFail": false },
        { "name": "Seat Belts", "condition": "Good", "isMandatoryFail": true },
        { "name": "Air Conditioning", "condition": "Good", "isMandatoryFail": false },
        { "name": "Exterior Body Condition", "condition": "Good", "isMandatoryFail": false },
        { "name": "Interior Upholstery", "condition": "Good", "isMandatoryFail": false },
        { "name": "Spare Tire & Jack", "condition": "Good", "isMandatoryFail": false }
      ]
    }
  },
  "notes": "Full inspection completed"
}
```

> **Gates:**
> - Exactly **23 checklist items** required
> - Minimum **6 exterior photos** must be uploaded
> - **Odometer photo** must be uploaded
>
> Upload photos first via `POST /api/vehicle/:id/upload-documents` with fields `exteriorPhotos` (min 6) and `odometerPhoto`.

> **Auto-fail logic:** If any item has `condition: "Poor"` AND `isMandatoryFail: true`, the vehicle automatically moves to `INSPECTION FAILED`.

**Allowed roles:** OperationStaff, BranchManager+

---

### Stage 4a — Inspection Failed → Repair (Side Branch)

If inspection fails, the vehicle goes to `INSPECTION FAILED` automatically.

**Progress to `REPAIR IN PROGRESS`:**

```json
{
  "targetStatus": "REPAIR IN PROGRESS",
  "notes": "Sending to workshop for repairs"
}
```

**Allowed roles:** WorkshopStaff, BranchManager+

After repairs, progress back to `INSPECTION REQUIRED` with new inspection data (same payload as Stage 4).

---

### Stage 5 — Accounting Setup (`ACCOUNTING SETUP`)

> **Gate:** Vehicle inspection must have status `"Passed"`.

**`PUT /api/vehicle/:id/progress`**

```json
{
  "targetStatus": "ACCOUNTING SETUP",
  "updateData": {
    "accountingSetup": {
      "depreciationMethod": "Straight-Line",
      "usefulLifeYears": 5,
      "residualValue": 5000,
      "isSetupComplete": true
    }
  },
  "notes": "Accounting setup completed"
}
```

**Allowed roles:** FinanceStaff, FinanceAdmin+

---

### Stage 6 — GPS Activation (`GPS ACTIVATION`)

> **Gate:** `accountingSetup.isSetupComplete` must be `true`.

**`PUT /api/vehicle/:id/progress`**

```json
{
  "targetStatus": "GPS ACTIVATION",
  "updateData": {
    "gpsConfiguration": {
      "isActivated": true,
      "geofenceZone": "Nairobi CBD",
      "speedLimitThreshold": 120,
      "idleTimeAlertMins": 30,
      "mileageSyncFrequencyHrs": 1
    }
  },
  "notes": "GPS installed and activated"
}
```

**Allowed roles:** OperationStaff, BranchManager+

---

### Stage 7 — Branch Manager Approval (`BRANCH MANAGER APPROVAL`)

> **Gate:** `gpsConfiguration.isActivated` must be `true`.

**`PUT /api/vehicle/:id/progress`**

```json
{
  "targetStatus": "BRANCH MANAGER APPROVAL",
  "notes": "Vehicle approved for fleet deployment"
}
```

**Allowed roles:** BranchManager, Admin

---

### Stage 8 — Active Available (`ACTIVE — AVAILABLE`)

**`PUT /api/vehicle/:id/progress`**

```json
{
  "targetStatus": "ACTIVE — AVAILABLE",
  "notes": "Vehicle is now available for rental"
}
```

**Allowed roles:** BranchManager, Admin

---

## Post-Onboarding Lifecycle Transitions

These are used after the vehicle is active in the fleet.

### Suspend Vehicle

```json
{
  "targetStatus": "SUSPENDED",
  "updateData": {
    "suspensionDetails": {
      "reason": "Accident",
      "suspendedUntil": "2026-04-01T00:00:00.000Z"
    }
  }
}
```
**Reason options:** `Accident`, `Legal`, `Police`, `Dispute`, `Other`

### Transfer Vehicle

```json
{
  "targetStatus": "TRANSFER PENDING",
  "updateData": {
    "transferDetails": {
      "toBranch": "DESTINATION_BRANCH_ID",
      "reason": "Rebalancing fleet",
      "estimatedArrival": "2026-03-20T00:00:00.000Z",
      "transportMethod": "Driven"
    }
  }
}
```
**Transport options:** `Driven`, `Flatbed`, `Shipping`

### Retire Vehicle

```json
{
  "targetStatus": "RETIRED",
  "updateData": {
    "retirementDetails": {
      "reason": "Sold",
      "disposalDate": "2026-06-01T00:00:00.000Z",
      "disposalValue": 12000
    }
  }
}
```
**Reason options:** `Sold`, `Written Off`, `End of Life`, `Beyond Repair`

### Send to Maintenance

```json
{
  "targetStatus": "ACTIVE — MAINTENANCE",
  "updateData": {
    "maintenanceDetails": {
      "type": "Scheduled",
      "estimatedCompletionDate": "2026-03-10T00:00:00.000Z"
    }
  }
}
```

---

## Upload Documents Reference

**`POST /api/vehicle/:id/upload-documents`** (`multipart/form-data`)

| Frontend Field Name | Maps To (DB Path) | Type |
|----|----|----|
| `registrationCertificate` | `legalDocs.registrationDocument` | Single file |
| `roadTaxDisc` | `legalDocs.roadTaxDisc` | Single file |
| `roadworthinessCertificate` | `legalDocs.roadworthinessCertificate` | Single file |
| `numberPlateFront` | — | Single file |
| `numberPlateRear` | — | Single file |
| `transferOfOwnership` | — | Single file |
| `purchaseReceipt` | — | Single file |
| `policyDocument` | `insurancePolicy.policyDocument` | Single file |
| `customsClearanceCertificate` | `importationDetails.customsDeclaration` | Single file |
| `importPermit` | `importationDetails.importPermit` | Single file |
| `odometerPhoto` | `inspection.odometerPhoto` | Single file |
| `exteriorPhotos` | `inspection.exteriorPhotos` | Multiple (max 20) |

---

## Error Codes

| Code | Meaning |
|------|---------|
| `400` | Invalid transition, missing data, or gate validation failed |
| `403` | Role not authorized for this transition |
| `404` | Vehicle not found |
| `500` | Server error |

---

## Optional: Importation Details

If the vehicle is imported, include `importationDetails` in any progress call:

```json
{
  "importationDetails": {
    "isImported": true,
    "countryOfOrigin": "Japan",
    "shippingReference": "SHIP-2026-001",
    "portOfEntry": "Mombasa",
    "customsDeclarationNumber": "CUST-2026-001",
    "arrivalDate": "2026-01-10T00:00:00.000Z",
    "shippingCost": 2000,
    "customsDuty": 3000,
    "portHandling": 500,
    "localTransport": 800,
    "otherCharges": 200
  }
}
```

> `landedCost` is **auto-calculated** by the backend when `isImported: true`.
