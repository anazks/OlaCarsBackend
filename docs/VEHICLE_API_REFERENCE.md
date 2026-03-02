# Vehicle Onboarding — Frontend API Reference

> **Base URL:** `/api/vehicle`
> **Auth:** All endpoints require `Authorization: Bearer <token>` header.

---

## Quick Overview

| Step | Action | Endpoint | Method |
|------|--------|----------|--------|
| 1 | Create vehicle | `/api/vehicle/` | POST |
| 2 | Upload files to S3 | `/api/vehicle/:id/upload-documents` | POST |
| 3–16 | Progress through stages | `/api/vehicle/:id/progress` | PUT |
| — | Get all vehicles | `/api/vehicle/` | GET |
| — | Get single vehicle | `/api/vehicle/:id` | GET |

---

## 1. Create Vehicle

```
POST /api/vehicle/
Content-Type: application/json
```

**Who can call:** OperationStaff, BranchManager, FinanceStaff, CountryManager, Admin

```json
{
  "purchaseDetails": {
    "purchaseOrder": "PO_OBJECT_ID",          // optional — link to existing PO
    "vendorName": "Toyota Ghana Ltd",
    "purchaseDate": "2025-03-01T00:00:00Z",
    "purchasePrice": 45000,
    "currency": "GHS",
    "paymentMethod": "Bank Transfer",          // "Cash" | "Bank Transfer" | "Finance"
    "financeDetails": {                        // only if paymentMethod = "Finance"
      "lenderName": "Stanbic Bank",
      "loanAmount": 40000,
      "termMonths": 36,
      "monthlyInstalment": 1200
    },
    "branch": "BRANCH_OBJECT_ID"              // required
  },
  "basicDetails": {
    "make": "Toyota",                          // required
    "model": "Corolla",                        // required
    "year": 2024,                              // required
    "vin": "JTDKN3DU5A0123456",               // required, must be unique
    "category": "Sedan",                       // "Sedan" | "SUV" | "Pickup" | "Van" | "Luxury" | "Commercial"
    "fuelType": "Petrol",                      // "Petrol" | "Diesel" | "Hybrid" | "Electric"
    "transmission": "Automatic",               // "Automatic" | "Manual"
    "engineCapacity": 1800,
    "colour": "White",
    "seats": 5,
    "engineNumber": "2NR-FKE-123456",
    "bodyType": "Saloon",                      // "Hatchback" | "Saloon" | "Coupe" | "Convertible" | "Truck"
    "odometer": 0,
    "gpsSerialNumber": "GPS-001-2024"
  }
}
```

**Response:** `201` with created vehicle object (status = `"PENDING ENTRY"`)

---

## 2. Upload Documents to S3

```
POST /api/vehicle/:id/upload-documents
Content-Type: multipart/form-data
```

**Who can call:** OperationStaff, BranchManager, FinanceStaff, CountryManager, Admin

**Form fields (all are file uploads):**

| Field Name | Type | Notes |
|------------|------|-------|
| `purchaseReceipt` | single file | Purchase receipt scan |
| `registrationCertificate` | single file | Registration certificate |
| `roadTaxDisc` | single file | Road tax disc |
| `numberPlateFront` | single file | Front plate photo |
| `numberPlateRear` | single file | Rear plate photo |
| `roadworthinessCertificate` | single file | Roadworthiness cert |
| `transferOfOwnership` | single file | Ownership transfer doc |
| `policyDocument` | single file | Insurance policy doc |
| `customsClearanceCertificate` | single file | Customs clearance cert |
| `importPermit` | single file | Import permit |
| `odometerPhoto` | single file | Odometer reading photo |
| `exteriorPhotos` | **multiple files (min 6)** | Vehicle exterior photos |

**Response:**
```json
{
  "success": true,
  "message": "Documents uploaded successfully to S3.",
  "data": {
    "registrationCertificate": "vehicles/abc123/documents/registrationCertificate_1709...",
    "exteriorPhotos": ["vehicles/abc123/documents/exteriorPhotos_1709...", "..."]
  }
}
```

> ⚠️ **Upload files first**, then use the returned S3 URLs in the progress endpoint payloads below.

---

## 3. Progress Vehicle Status

```
PUT /api/vehicle/:id/progress
Content-Type: application/json
```

**Who can call:** Depends on the target status (see role column below).

**General shape:**
```json
{
  "targetStatus": "STATUS_NAME_HERE",
  "notes": "Optional notes for the audit trail",
  "updateData": {
    // ... stage-specific data (see below)
  }
}
```

---

### Stage A → DOCUMENTS REVIEW

**Role:** OperationStaff, BranchManager+

```json
{
  "targetStatus": "DOCUMENTS REVIEW",
  "updateData": {
    "legalDocs": {
      "registrationCertificate": "S3_URL",       // required
      "registrationNumber": "GR-1234-24",
      "registrationExpiry": "2026-03-01T00:00:00Z",
      "roadTaxDisc": "S3_URL",                   // required
      "roadTaxExpiry": "2026-03-01T00:00:00Z",
      "numberPlateFront": "S3_URL",
      "numberPlateRear": "S3_URL",
      "roadworthinessCertificate": "S3_URL",      // required
      "roadworthinessExpiry": "2026-03-01T00:00:00Z",
      "transferOfOwnership": "S3_URL"
    }
  }
}
```

> 🔒 **Gate:** `registrationCertificate`, `roadTaxDisc`, `roadworthinessCertificate` must all be present.

---

### Stage B → INSURANCE VERIFICATION

**Role:** OperationStaff, FinanceStaff, BranchManager+

```json
{
  "targetStatus": "INSURANCE VERIFICATION",
  "updateData": {
    "insurancePolicy": {
      "insuranceType": "Comprehensive",           // required: "Comprehensive" | "Third-Party" | "Fleet Policy"
      "providerName": "Star Assurance",           // required
      "policyNumber": "POL-2024-00123",           // required
      "startDate": "2024-01-01T00:00:00Z",        // required
      "expiryDate": "2025-01-01T00:00:00Z",       // required
      "premiumAmount": 5000,
      "coverageAmount": 100000,
      "policyDocument": "S3_URL",
      "excessAmount": 500,
      "namedDrivers": ["John Doe", "Jane Smith"],
      "claimsHistory": "No prior claims"
    },
    "importationDetails": {                        // OPTIONAL — only if vehicle is imported
      "isImported": true,
      "countryOfOrigin": "Japan",
      "shippingReference": "BOL-2024-789",
      "portOfEntry": "Tema Port",
      "customsDeclarationNumber": "CD-2024-456",
      "arrivalDate": "2024-02-15T00:00:00Z",
      "shippingCost": 3000,
      "customsDuty": 2000,
      "portHandling": 500,
      "localTransport": 300,
      "otherCharges": 200,
      "customsClearanceCertificate": "S3_URL",
      "importPermit": "S3_URL"
    }
  }
}
```

> 🔒 **Gate:** `insuranceType`, `providerName`, `policyNumber`, `startDate`, `expiryDate` must all be present.
>
> 💡 `landedCost` is **auto-calculated** by the backend. Don't send it.

---

### Stage C → INSPECTION REQUIRED

**Role:** OperationStaff, BranchManager+

```json
{
  "targetStatus": "INSPECTION REQUIRED",
  "updateData": {
    "inspection": {
      "date": "2024-03-15T00:00:00Z",
      "checklistItems": [
        { "name": "Engine Oil Level", "condition": "Good", "notes": "", "isMandatoryFail": true },
        { "name": "Coolant Level", "condition": "Good", "notes": "", "isMandatoryFail": true },
        { "name": "Brake Fluid", "condition": "Good", "notes": "", "isMandatoryFail": true },
        { "name": "Power Steering Fluid", "condition": "Fair", "notes": "Slightly low", "isMandatoryFail": false },
        { "name": "Transmission Fluid", "condition": "Good", "notes": "", "isMandatoryFail": true },
        { "name": "Tyre Condition - Front Left", "condition": "Good", "notes": "", "isMandatoryFail": true },
        { "name": "Tyre Condition - Front Right", "condition": "Good", "notes": "", "isMandatoryFail": true },
        { "name": "Tyre Condition - Rear Left", "condition": "Good", "notes": "", "isMandatoryFail": true },
        { "name": "Tyre Condition - Rear Right", "condition": "Good", "notes": "", "isMandatoryFail": true },
        { "name": "Spare Tyre", "condition": "Good", "notes": "", "isMandatoryFail": false },
        { "name": "Brake Pads - Front", "condition": "Good", "notes": "", "isMandatoryFail": true },
        { "name": "Brake Pads - Rear", "condition": "Good", "notes": "", "isMandatoryFail": true },
        { "name": "Headlights", "condition": "Good", "notes": "", "isMandatoryFail": true },
        { "name": "Tail Lights", "condition": "Good", "notes": "", "isMandatoryFail": true },
        { "name": "Indicators", "condition": "Good", "notes": "", "isMandatoryFail": false },
        { "name": "Windshield Condition", "condition": "Good", "notes": "", "isMandatoryFail": true },
        { "name": "Wipers", "condition": "Good", "notes": "", "isMandatoryFail": false },
        { "name": "Side Mirrors", "condition": "Good", "notes": "", "isMandatoryFail": false },
        { "name": "Air Conditioning", "condition": "Good", "notes": "", "isMandatoryFail": false },
        { "name": "Horn", "condition": "Good", "notes": "", "isMandatoryFail": false },
        { "name": "Seatbelts", "condition": "Good", "notes": "", "isMandatoryFail": true },
        { "name": "Battery Condition", "condition": "Good", "notes": "", "isMandatoryFail": true },
        { "name": "Exhaust System", "condition": "Good", "notes": "", "isMandatoryFail": true }
      ],
      "exteriorPhotos": [
        "S3_URL_1", "S3_URL_2", "S3_URL_3",
        "S3_URL_4", "S3_URL_5", "S3_URL_6"
      ],
      "odometerPhoto": "S3_URL"
    }
  }
}
```

> 🔒 **Gate:** Exactly 23 checklist items + min 6 exterior photos + odometer photo required.
>
> ⚡ **Auto-fail:** If ANY item has `condition: "Poor"` AND `isMandatoryFail: true`, the backend auto-transitions to `INSPECTION FAILED` instead.

**condition values:** `"Good"` | `"Fair"` | `"Poor"`

---

### Stage D → REPAIR IN PROGRESS (after inspection failure)

**Role:** WorkshopStaff, BranchManager+

```json
{
  "targetStatus": "REPAIR IN PROGRESS",
  "notes": "Replacing front brake pads and fixing coolant leak"
}
```

> After repair is done, submit a fresh inspection → `"INSPECTION REQUIRED"` again.

---

### Stage E → ACCOUNTING SETUP

**Role:** FinanceStaff, FinanceAdmin, Admin

```json
{
  "targetStatus": "ACCOUNTING SETUP",
  "updateData": {
    "accountingSetup": {
      "depreciationMethod": "Straight-Line",       // "Straight-Line" | "Reducing Balance"
      "usefulLifeYears": 5,
      "residualValue": 5000,
      "isSetupComplete": true                      // must be true to proceed to GPS
    }
  }
}
```

> 🔒 **Gate:** `inspection.status` must be `"Passed"` (auto-set by the backend if inspection passes).

---

### Stage F → GPS ACTIVATION

**Role:** OperationStaff, BranchManager+

```json
{
  "targetStatus": "GPS ACTIVATION",
  "updateData": {
    "gpsConfiguration": {
      "isActivated": true,                         // must be true to proceed
      "geofenceZone": "Accra Metro",
      "speedLimitThreshold": 120,
      "idleTimeAlertMins": 30,
      "mileageSyncFrequencyHrs": 1
    }
  }
}
```

> 🔒 **Gate:** `accountingSetup.isSetupComplete` must be `true`.

---

### Stage G → BRANCH MANAGER APPROVAL

**Role:** BranchManager, Admin

```json
{
  "targetStatus": "BRANCH MANAGER APPROVAL",
  "notes": "All stages reviewed and satisfactory"
}
```

> 🔒 **Gate:** `gpsConfiguration.isActivated` must be `true`.

---

### Stage H → ACTIVE — AVAILABLE

**Role:** BranchManager, Admin

```json
{
  "targetStatus": "ACTIVE — AVAILABLE",
  "notes": "Vehicle activated for fleet"
}
```

---

## 4. Fleet Lifecycle Actions

### Pull for Maintenance

**Role:** OperationStaff, BranchManager+

```json
{
  "targetStatus": "ACTIVE — MAINTENANCE",
  "notes": "Scheduled 10,000km service",
  "updateData": {
    "maintenanceDetails": {
      "type": "Scheduled",                          // "Scheduled" | "Unscheduled" | "Emergency"
      "estimatedCompletionDate": "2024-04-01T00:00:00Z",
      "assignedTo": "WORKSHOP_STAFF_OBJECT_ID"      // optional
    }
  }
}
```

> To return from maintenance → send `targetStatus: "ACTIVE — AVAILABLE"`

---

### Suspend Vehicle (Emergency)

**Role:** BranchManager, CountryManager+

```json
{
  "targetStatus": "SUSPENDED",
  "notes": "Vehicle involved in accident, pending investigation",
  "updateData": {
    "suspensionDetails": {
      "reason": "Accident",                         // required: "Accident" | "Legal" | "Police" | "Dispute" | "Other"
      "suspendedUntil": "2024-05-01T00:00:00Z"      // optional
    }
  }
}
```

> 🔒 **Gate:** `reason` is required.
>
> To restore → send `targetStatus: "ACTIVE — AVAILABLE"`. The backend auto-captures the previous status.

---

### Transfer to Another Branch

**Role:** BranchManager, CountryManager+

**Step 1 — Initiate transfer:**
```json
{
  "targetStatus": "TRANSFER PENDING",
  "notes": "Transferring to Kumasi branch due to low demand in Accra",
  "updateData": {
    "transferDetails": {
      "toBranch": "DESTINATION_BRANCH_OBJECT_ID",   // required, must be different from current
      "reason": "Demand rebalancing",
      "estimatedArrival": "2024-04-10T00:00:00Z",
      "transportMethod": "Driven"                   // "Driven" | "Flatbed" | "Shipping"
    }
  }
}
```

**Step 2 — Mark received at destination:**
```json
{
  "targetStatus": "TRANSFER COMPLETE",
  "notes": "Vehicle received at Kumasi branch"
}
```

**Step 3 — Activate at new branch:**
```json
{
  "targetStatus": "ACTIVE — AVAILABLE",
  "notes": "Vehicle activated at new branch"
}
```

> 🔒 **Gate:** `toBranch` is required and must differ from current branch.
>
> 💡 The backend auto-updates `purchaseDetails.branch` on step 3.

---

### Retire Vehicle

**Role:** BranchManager, CountryManager, Admin

```json
{
  "targetStatus": "RETIRED",
  "notes": "Vehicle sold to third party",
  "updateData": {
    "retirementDetails": {
      "reason": "Sold",                              // required: "Sold" | "Written Off" | "End of Life" | "Beyond Repair"
      "disposalDate": "2024-06-01T00:00:00Z",
      "disposalValue": 15000                         // sale price or scrap value
    }
  }
}
```

> 🔒 **Gate:** `reason` is required.
> ⚠️ This is a **terminal state** — the vehicle cannot be reactivated.

---

## 5. Read Endpoints

### Get All Vehicles
```
GET /api/vehicle/
```

### Get Single Vehicle
```
GET /api/vehicle/:id
```

Returns the full vehicle object with all stage data, status history, and current status.

---

## 6. Status Flow Cheat Sheet

```
PENDING ENTRY
    ↓
DOCUMENTS REVIEW  ←─ (reject back from INSURANCE VERIFICATION)
    ↓
INSURANCE VERIFICATION
    ↓
INSPECTION REQUIRED  ←─ (re-inspect after repair)
    ↓                ↘
ACCOUNTING SETUP    INSPECTION FAILED → REPAIR IN PROGRESS
    ↓
GPS ACTIVATION
    ↓
BRANCH MANAGER APPROVAL
    ↓
ACTIVE — AVAILABLE ←──── (returns from maintenance / transfer / suspension)
    ├── ACTIVE — RENTED       (system-only, via booking)
    ├── ACTIVE — MAINTENANCE  (pull for service)
    ├── SUSPENDED             (emergency hold)
    ├── TRANSFER PENDING → TRANSFER COMPLETE → ACTIVE — AVAILABLE
    └── RETIRED               (permanent, terminal)
```

---

## 7. Error Responses

All errors return:
```json
{
  "success": false,
  "message": "Error description here"
}
```

| Code | Meaning |
|------|---------|
| 400 | Invalid transition, missing required data, or gate validation failed |
| 403 | Your role is not authorized for this transition |
| 404 | Vehicle not found |
| 500 | Server error |
