# Specification: Vehicle Onboarding & Fleet Lifecycle

**Status:** FINALIZED
**Version:** 3.0
**Source Document:** `docx_extracted.txt` (OLA-VEH-ONBOARD-03)

---

## 1. Overview

A **10-stage vehicle onboarding pipeline** + **full active-fleet lifecycle management** for OlaCars. The system enforces **sequential stage completion** — every stage must be fully validated before the next unlocks. A unified progress endpoint drives all transitions through a state-machine workflow engine.

### 1.1 Design Principles

- **Single endpoint, many transitions** — `PUT /api/vehicle/:id/progress` handles all state changes
- **Gate before you go** — Data completeness validators block transitions until requirements are met
- **Role + hierarchy** — Every action checks explicit role permission OR minimum hierarchy level
- **Full audit trail** — Every status change is permanently logged with actor, role, timestamp, and notes
- **Reject & retry** — Built-in loops for document rejection and failed inspections

---

## 2. Role Hierarchy & Access Matrix

### 2.1 Role Hierarchy (ascending authority)

```
Level 1 ─ OPERATIONSTAFF     Ground-level ops (data entry, inspections, GPS)
Level 1 ─ FINANCESTAFF       Ground-level finance (accounting, ledger)
Level 2 ─ WORKSHOPSTAFF      Vehicle repairs and maintenance
Level 3 ─ BRANCHMANAGER      Branch authority (approvals, transfers, retirement)
Level 4 ─ COUNTRYMANAGER     Country oversight (cross-branch, retirement)
Level 5 ─ OPERATIONADMIN     Operations department head
Level 5 ─ FINANCEADMIN       Finance department head
Level 6 ─ ADMIN              Full system override
```

> [!IMPORTANT]
> Any role at or above the `minHierarchy` level can perform an action, even if not explicitly listed in `allowedRoles`. This means a BranchManager can always do what OperationStaff can do.

### 2.2 Who Does What (Quick Reference)

| Activity | Primary Role | Can Also Do |
|---|---|---|
| Create vehicle record | OperationStaff | BranchManager+ |
| Upload documents / S3 files | OperationStaff | BranchManager+ |
| Submit legal documents | OperationStaff | BranchManager+ |
| Submit insurance details | OperationStaff, FinanceStaff | BranchManager+ |
| Physical inspection (23-point) | OperationStaff | BranchManager+ |
| Initiate repair after failed inspection | WorkshopStaff | BranchManager+ |
| Complete repair, re-submit for inspection | WorkshopStaff | BranchManager+ |
| Configure accounting/depreciation | FinanceStaff | FinanceAdmin, Admin |
| Configure & activate GPS | OperationStaff | BranchManager+ |
| Final onboarding approval | BranchManager | CountryManager+ |
| Activate vehicle for fleet | BranchManager | Admin |
| Pull vehicle for maintenance | OperationStaff, BranchManager | Admin |
| Suspend vehicle (emergency) | BranchManager | CountryManager+ |
| Initiate inter-branch transfer | BranchManager | CountryManager+ |
| Accept transferred vehicle | BranchManager (receiving) | CountryManager+ |
| Retire vehicle | BranchManager, CountryManager | Admin |
| Override system-protected status | Admin only | — |

---

## 3. Vehicle Status Flow (16 states)

### 3.1 All Statuses

| # | Status | Category | Description |
|---|--------|----------|-------------|
| 1 | `PENDING ENTRY` | Onboarding | Vehicle record created. Procurement data captured. |
| 2 | `DOCUMENTS REVIEW` | Onboarding | Basic details + legal documents submitted for review. |
| 3 | `INSURANCE VERIFICATION` | Onboarding | Legal docs approved. Insurance policy must be submitted & verified. |
| 4 | `INSPECTION REQUIRED` | Onboarding | Insurance verified. Vehicle ready for 23-point physical inspection. |
| 5 | `INSPECTION FAILED` | Onboarding | Mandatory inspection item(s) rated "Poor". Requires repair. |
| 6 | `REPAIR IN PROGRESS` | Onboarding | Workshop staff actively repairing failed inspection items. |
| 7 | `ACCOUNTING SETUP` | Onboarding | Inspection passed. Finance team configuring depreciation & GL postings. |
| 8 | `GPS ACTIVATION` | Onboarding | Accounting confirmed. GPS device being synced and configured. |
| 9 | `BRANCH MANAGER APPROVAL` | Onboarding | GPS active. Awaiting Branch Manager final sign-off. |
| 10 | `ACTIVE — AVAILABLE` | Active | Fully onboarded. Available for rental bookings. |
| 11 | `ACTIVE — RENTED` | Active | Currently rented out. **System-triggered only** (via booking module). |
| 12 | `ACTIVE — MAINTENANCE` | Active | Pulled for scheduled or unscheduled maintenance. |
| 13 | `SUSPENDED` | Hold | Emergency hold — accident, legal issue, police seizure, dispute. |
| 14 | `TRANSFER PENDING` | Transfer | Inter-branch/inter-country transfer initiated. In transit. |
| 15 | `TRANSFER COMPLETE` | Transfer | Physically received at destination. Awaiting acceptance by receiving Branch Manager. |
| 16 | `RETIRED` | Terminal | Permanently removed from fleet. Final state. |

### 3.2 State Machine Diagram

```
═══════════════════════════════════════════════════════════════════════════════
                           ONBOARDING PIPELINE
═══════════════════════════════════════════════════════════════════════════════

  ┌──────────────┐     ┌──────────────────┐     ┌───────────────────────┐
  │ PENDING      │────►│ DOCUMENTS        │────►│ INSURANCE             │
  │ ENTRY        │     │ REVIEW           │     │ VERIFICATION          │
  └──────┬───────┘     └────────▲─────────┘     └───────────┬───────────┘
         ▲                      │                           │
         │           (doc rejection loop)                   │
         └──────────────────────┘                           ▼
                                                ┌─────────────────────┐
                                                │ INSPECTION          │
                                         ┌──────│ REQUIRED            │◄──────┐
                                         │      └─────────────────────┘       │
                                         │                                    │
                                    (all pass)                         (re-inspect)
                                         │                                    │
                                         │      ┌─────────────────────┐       │
                                         │      │ INSPECTION FAILED   │───────┤
                                         │      └──────────┬──────────┘       │
                                         │                 │                  │
                                         │                 ▼                  │
                                         │      ┌─────────────────────┐       │
                                         │      │ REPAIR IN PROGRESS  │───────┘
                                         │      └─────────────────────┘
                                         ▼
  ┌──────────────────┐     ┌────────────────────┐     ┌──────────────────────┐
  │ GPS              │◄────│ ACCOUNTING         │◄────│ (passed inspection)  │
  │ ACTIVATION       │     │ SETUP              │     └──────────────────────┘
  └────────┬─────────┘     └────────────────────┘
           │
           ▼
  ┌────────────────────┐     ┌────────────────────┐
  │ BRANCH MANAGER     │────►│ ACTIVE —           │
  │ APPROVAL           │     │ AVAILABLE          │
  └────────────────────┘     └──┬───┬───┬───┬─────┘
                                │   │   │   │
═══════════════════════════════════════════════════════════════════════════════
                        ACTIVE FLEET LIFECYCLE
═══════════════════════════════════════════════════════════════════════════════
                                │   │   │   │
                  ┌─────────────┘   │   │   └───────────────┐
                  ▼                 ▼   ▼                   ▼
          ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐
          │ ACTIVE —     │  │ ACTIVE —     │  │ TRANSFER             │
          │ RENTED       │  │ MAINTENANCE  │  │ PENDING              │
          │ (system only)│  └──────┬───────┘  └───────────┬──────────┘
          └──────┬───────┘         │                      │
                 │                 │                      ▼
                 │                 │          ┌──────────────────────┐
                 │                 │          │ TRANSFER             │
                 │                 │          │ COMPLETE             │
                 │                 │          └───────────┬──────────┘
                 │                 │                      │
                 ▼                 ▼                      ▼
          ┌──────────────────────────────────────────────────────┐
          │            ACTIVE — AVAILABLE (returns here)         │
          └───────────────────────┬──────────────────────────────┘
                                  │
              ┌───────────────────┼───────────────────┐
              ▼                   ▼                   ▼
       ┌─────────────┐    ┌─────────────┐     ┌─────────────┐
       │  SUSPENDED   │    │  RETIRED    │     │  ...        │
       │  (emergency) │    │  (terminal) │     └─────────────┘
       └──────┬───────┘    └─────────────┘
              │
              ▼
       (returns to previous
        ACTIVE state or RETIRED)
```

---

## 4. Status Transition Rules

### 4.1 Full Transition Matrix

| # | Target Status | Allowed From | Allowed Roles | Min Hierarchy | Gate Validator |
|---|---|---|---|---|---|
| 1 | `PENDING ENTRY` | `DOCUMENTS REVIEW` | OperationStaff | BranchManager | — |
| 2 | `DOCUMENTS REVIEW` | `PENDING ENTRY`, `INSURANCE VERIFICATION` | OperationStaff | BranchManager | Reg cert, road tax, roadworthiness uploaded |
| 3 | `INSURANCE VERIFICATION` | `DOCUMENTS REVIEW` | OperationStaff, FinanceStaff | BranchManager | Insurance policy, provider, policy number, start/expiry dates all present |
| 4 | `INSPECTION REQUIRED` | `INSURANCE VERIFICATION`, `REPAIR IN PROGRESS` | OperationStaff | BranchManager | 23 checklist items + ≥6 exterior photos + odometer photo |
| 5 | `INSPECTION FAILED` | `INSPECTION REQUIRED` | OperationStaff, BranchManager | Admin | Auto-detected: any mandatory item rated "Poor" |
| 6 | `REPAIR IN PROGRESS` | `INSPECTION FAILED` | WorkshopStaff, BranchManager | Admin | — |
| 7 | `ACCOUNTING SETUP` | `INSPECTION REQUIRED` | FinanceStaff | FinanceAdmin | Inspection status = "Passed" (no mandatory fails) |
| 8 | `GPS ACTIVATION` | `ACCOUNTING SETUP` | OperationStaff | BranchManager | `accountingSetup.isSetupComplete = true` |
| 9 | `BRANCH MANAGER APPROVAL` | `GPS ACTIVATION` | BranchManager | Admin | `gpsConfiguration.isActivated = true` |
| 10 | `ACTIVE — AVAILABLE` | `BRANCH MANAGER APPROVAL`, `ACTIVE — RENTED`, `ACTIVE — MAINTENANCE`, `TRANSFER COMPLETE`, `SUSPENDED` | BranchManager | Admin | — |
| 11 | `ACTIVE — RENTED` | `ACTIVE — AVAILABLE` | **System only** | Admin | Registration, road tax, insurance not expired |
| 12 | `ACTIVE — MAINTENANCE` | `ACTIVE — AVAILABLE`, `ACTIVE — RENTED` | OperationStaff, BranchManager | Admin | — |
| 13 | `SUSPENDED` | `ACTIVE — AVAILABLE`, `ACTIVE — RENTED`, `ACTIVE — MAINTENANCE` | BranchManager | CountryManager | Suspension reason required |
| 14 | `TRANSFER PENDING` | `ACTIVE — AVAILABLE` | BranchManager | CountryManager | Destination branch required |
| 15 | `TRANSFER COMPLETE` | `TRANSFER PENDING` | BranchManager | CountryManager | — |
| 16 | `RETIRED` | `ACTIVE — AVAILABLE`, `ACTIVE — MAINTENANCE`, `SUSPENDED` | BranchManager, CountryManager | Admin | Retirement reason required |

### 4.2 System-Protected Statuses

These cannot be manually triggered except by ADMIN override:

| Status | Reason |
|---|---|
| `ACTIVE — RENTED` | Triggered by the booking/rental module when a customer rents the vehicle |
| `INSPECTION FAILED` | Auto-detected by the workflow engine when mandatory checklist items fail |

---

## 5. Rejection & Retry Loops

### 5.1 Document Rejection Loop

```
DOCUMENTS REVIEW  ──(rejected)──►  PENDING ENTRY  ──(re-submit)──►  DOCUMENTS REVIEW
```

**When:** Documents are incomplete, incorrect, or fraudulent.
**Who rejects:** OperationStaff, BranchManager, or higher.
**What happens:** Vehicle goes back to `PENDING ENTRY`. The user must fix the issues and re-upload documents before progressing again.

### 5.2 Insurance Rejection Loop

```
INSURANCE VERIFICATION  ──(rejected)──►  DOCUMENTS REVIEW  ──(re-submit)──►  INSURANCE VERIFICATION
```

**When:** Insurance policy is invalid, expired, or doesn't meet coverage requirements.
**Who rejects:** OperationStaff, FinanceStaff, BranchManager, or higher.

### 5.3 Inspection Fail → Repair → Re-inspect Loop

```
INSPECTION REQUIRED  ──(fail)──►  INSPECTION FAILED  ──►  REPAIR IN PROGRESS  ──►  INSPECTION REQUIRED
```

**When:** Any mandatory checklist item is rated "Poor" (`isMandatoryFail: true`).
**Flow:**
1. OperationStaff submits inspection → engine auto-detects failure → `INSPECTION FAILED`
2. WorkshopStaff picks up the vehicle → `REPAIR IN PROGRESS`
3. After repairs, WorkshopStaff re-submits → `INSPECTION REQUIRED` (fresh inspection)
4. If passes → `ACCOUNTING SETUP`. If fails again → loop repeats.

---

## 6. API Endpoints

### 6.1 Create Vehicle

| | |
|---|---|
| **Route** | `POST /api/vehicle/` |
| **Access** | OperationStaff, BranchManager, FinanceStaff, CountryManager, Admin |
| **Action** | Creates new vehicle in `PENDING ENTRY` with procurement + basic details |
| **Auto-sets** | `status = "PENDING ENTRY"`, `createdBy`, `creatorRole` from JWT |

**Request Body:**

```json
{
  "purchaseDetails": {
    "purchaseOrder": "PO ObjectId (optional link)",
    "vendorName": "string",
    "purchaseDate": "ISO date",
    "purchasePrice": "number",
    "currency": "string",
    "paymentMethod": "Cash | Bank Transfer | Finance",
    "financeDetails": {
      "lenderName": "string",
      "loanAmount": "number",
      "termMonths": "number",
      "monthlyInstalment": "number"
    },
    "branch": "Branch ObjectId (required)"
  },
  "basicDetails": {
    "make": "string (required)",
    "model": "string (required)",
    "year": "number (required)",
    "vin": "string (required, unique, uppercase, trimmed)",
    "category": "Sedan | SUV | Pickup | Van | Luxury | Commercial",
    "fuelType": "Petrol | Diesel | Hybrid | Electric",
    "transmission": "Automatic | Manual",
    "engineCapacity": "number (CC)",
    "colour": "string",
    "seats": "number",
    "engineNumber": "string",
    "bodyType": "Hatchback | Saloon | Coupe | Convertible | Truck",
    "odometer": "number",
    "gpsSerialNumber": "string"
  }
}
```

---

### 6.2 Progress Vehicle Status (Unified Workflow Endpoint)

| | |
|---|---|
| **Route** | `PUT /api/vehicle/:id/progress` |
| **Access** | Authenticated — role checked per target status (see §4.1) |
| **Action** | Validate transition → apply data → change status → record audit → trigger side effects |

**Request Body:**

```json
{
  "targetStatus": "TARGET_STATUS_STRING",
  "updateData": { /* stage-specific payload, see below */ },
  "notes": "optional transition notes"
}
```

#### Per-Stage Payloads:

**→ `DOCUMENTS REVIEW`** (submit legal docs)
```json
{
  "legalDocs": {
    "registrationCertificate": "S3 URL (required)",
    "registrationNumber": "string",
    "registrationExpiry": "ISO date",
    "roadTaxDisc": "S3 URL (required)",
    "roadTaxExpiry": "ISO date",
    "numberPlateFront": "S3 URL",
    "numberPlateRear": "S3 URL",
    "roadworthinessCertificate": "S3 URL (required)",
    "roadworthinessExpiry": "ISO date",
    "transferOfOwnership": "S3 URL"
  }
}
```

**→ `INSURANCE VERIFICATION`** (submit insurance + optional importation)
```json
{
  "insurancePolicy": {
    "insuranceType": "Comprehensive | Third-Party | Fleet Policy (required)",
    "providerName": "string (required)",
    "policyNumber": "string (required)",
    "startDate": "ISO date (required)",
    "expiryDate": "ISO date (required)",
    "premiumAmount": "number",
    "coverageAmount": "number",
    "policyDocument": "S3 URL",
    "excessAmount": "number",
    "namedDrivers": ["string"],
    "claimsHistory": "string"
  },
  "importationDetails": {
    "isImported": "boolean (default: false)",
    "countryOfOrigin": "string (required if imported)",
    "shippingReference": "string (BOL)",
    "portOfEntry": "string",
    "customsDeclarationNumber": "string",
    "arrivalDate": "ISO date",
    "shippingCost": "number",
    "customsDuty": "number",
    "portHandling": "number",
    "localTransport": "number",
    "otherCharges": "number",
    "customsClearanceCertificate": "S3 URL",
    "importPermit": "S3 URL"
  }
}
```

> [!NOTE]
> `importationDetails` is **conditional** — only required if `isImported = true`. The `landedCost` field is **auto-calculated** as `shippingCost + customsDuty + portHandling + localTransport + otherCharges`.

**→ `INSPECTION REQUIRED`** (submit 23-point checklist)
```json
{
  "inspection": {
    "checkedBy": "User ObjectId (auto from JWT)",
    "checkedByRole": "OPERATIONSTAFF | BRANCHMANAGER",
    "date": "ISO date",
    "checklistItems": [
      {
        "name": "Engine Oil Level",
        "condition": "Good | Fair | Poor",
        "notes": "optional",
        "isMandatoryFail": false
      }
    ],
    "exteriorPhotos": ["S3 URL (min 6)"],
    "odometerPhoto": "S3 URL (required)"
  }
}
```

> [!IMPORTANT]
> If any item has `condition: "Poor"` AND `isMandatoryFail: true`, the engine auto-sets `inspection.status = "Failed"` and transitions to `INSPECTION FAILED` instead of `ACCOUNTING SETUP`.

**→ `REPAIR IN PROGRESS`** (workshop picks up)
```json
{
  "notes": "Description of repair scope and estimated timeline"
}
```

**→ `ACCOUNTING SETUP`** (finance configures GL)
```json
{
  "accountingSetup": {
    "depreciationMethod": "Straight-Line | Reducing Balance",
    "usefulLifeYears": "number",
    "residualValue": "number",
    "isSetupComplete": true
  }
}
```

**→ `GPS ACTIVATION`** (ops configures GPS)
```json
{
  "gpsConfiguration": {
    "isActivated": true,
    "geofenceZone": "string",
    "speedLimitThreshold": "number (km/h)",
    "idleTimeAlertMins": "number (default: 30)",
    "mileageSyncFrequencyHrs": "number (default: 1)"
  }
}
```

**→ `BRANCH MANAGER APPROVAL`** (final sign-off)
```json
{
  "notes": "Approval notes — BM confirms all stages are satisfactory"
}
```

**→ `ACTIVE — AVAILABLE`** (activate for fleet)
```json
{
  "notes": "Vehicle activated and available for booking"
}
```

**→ `ACTIVE — MAINTENANCE`** (pull from fleet)
```json
{
  "notes": "Reason: scheduled service / breakdown / tyre change / etc.",
  "maintenanceDetails": {
    "type": "Scheduled | Unscheduled | Emergency",
    "estimatedCompletionDate": "ISO date",
    "assignedTo": "WorkshopStaff ObjectId (optional)"
  }
}
```

**→ `SUSPENDED`** (emergency hold)
```json
{
  "notes": "Reason: accident investigation / police seizure / legal dispute / customer complaint",
  "suspensionDetails": {
    "reason": "Accident | Legal | Police | Dispute | Other (required)",
    "suspendedUntil": "ISO date (optional, for timed suspensions)",
    "previousStatus": "auto-captured by engine for restoration"
  }
}
```

**→ `TRANSFER PENDING`** (initiate inter-branch transfer)
```json
{
  "transferDetails": {
    "fromBranch": "Branch ObjectId (auto from current vehicle.purchaseDetails.branch)",
    "toBranch": "Branch ObjectId (required)",
    "reason": "string",
    "estimatedArrival": "ISO date",
    "transportMethod": "Driven | Flatbed | Shipping"
  }
}
```

**→ `TRANSFER COMPLETE`** (vehicle arrived at destination)
```json
{
  "notes": "Vehicle physically received at destination branch"
}
```

> [!NOTE]
> On acceptance (`TRANSFER COMPLETE` → `ACTIVE — AVAILABLE`), the engine should auto-update `purchaseDetails.branch` to the new destination branch.

**→ `RETIRED`** (permanent removal)
```json
{
  "notes": "Retirement reason: sold / written off / end of life / beyond repair",
  "retirementDetails": {
    "reason": "Sold | Written Off | End of Life | Beyond Repair (required)",
    "disposalDate": "ISO date",
    "disposalValue": "number (sale price or scrap value, if any)"
  }
}
```

---

### 6.3 Upload Documents to S3

| | |
|---|---|
| **Route** | `POST /api/vehicle/:id/upload-documents` |
| **Access** | Authenticated |
| **Action** | Multipart form-data upload → S3, returns S3 keys for use in progress endpoint |

**Supported fields:**

| Field | Type | Notes |
|---|---|---|
| `purchaseReceipt` | Single | Purchase receipt scan |
| `registrationCertificate` | Single | Reg cert |
| `roadTaxDisc` | Single | Road tax disc |
| `numberPlateFront` | Single | Front plate photo |
| `numberPlateRear` | Single | Rear plate photo |
| `roadworthinessCertificate` | Single | Roadworthiness cert |
| `transferOfOwnership` | Single | Ownership transfer doc |
| `policyDocument` | Single | Insurance policy doc |
| `customsClearanceCertificate` | Single | Customs clearance cert |
| `importPermit` | Single | Import permit |
| `odometerPhoto` | Single | Odometer reading photo |
| `exteriorPhotos` | **Array (min 6)** | Vehicle exterior photos |

**Response:**
```json
{
  "success": true,
  "message": "Documents uploaded successfully to S3.",
  "data": {
    "registrationCertificate": "vehicles/{id}/documents/registrationCertificate_...",
    "exteriorPhotos": ["vehicles/{id}/documents/exteriorPhotos_...", "..."]
  }
}
```

> [!TIP]
> **Workflow pattern:** Upload files first via `POST /:id/upload-documents`, then include the returned S3 keys in the `PUT /:id/progress` `updateData` payload.

---

### 6.4 Read Endpoints

| Route | Action | Filters |
|---|---|---|
| `GET /api/vehicle/` | List all vehicles | `?status=`, `?branch=`, `?category=` |
| `GET /api/vehicle/:id` | Full vehicle detail with all stage data + history | — |

---

## 7. Gate Validators (Data Completeness Checks)

| # | Transition To | Validation Rule | Error Message |
|---|---|---|---|
| 1 | `DOCUMENTS REVIEW` | `registrationCertificate`, `roadTaxDisc`, `roadworthinessCertificate` all uploaded | "All mandatory documents must be uploaded." |
| 2 | `INSURANCE VERIFICATION` | `insuranceType`, `providerName`, `policyNumber`, `startDate`, `expiryDate` all present | "Insurance policy details are incomplete." |
| 3 | `INSPECTION REQUIRED` | 23 checklist items + ≥6 exterior photos + odometer photo | "Inspection checklist incomplete." |
| 4 | `ACCOUNTING SETUP` | `inspection.status = "Passed"` (no mandatory fails) | "Vehicle did not pass inspection." |
| 5 | `GPS ACTIVATION` | `accountingSetup.isSetupComplete = true` | "Accounting setup must be confirmed complete." |
| 6 | `BRANCH MANAGER APPROVAL` | `gpsConfiguration.isActivated = true` | "GPS must be synced and activated." |
| 7 | `ACTIVE — RENTED` | Registration, road tax, insurance all non-expired | "Cannot rent: [document] has expired." |
| 8 | `SUSPENDED` | `suspensionDetails.reason` is required | "Suspension reason is required." |
| 9 | `TRANSFER PENDING` | `transferDetails.toBranch` is required and different from current branch | "Destination branch is required." |
| 10 | `RETIRED` | `retirementDetails.reason` is required | "Retirement reason is required." |

---

## 8. External Side Effects

The workflow engine triggers external actions on specific transitions:

| Target Status | Side Effect | Implementation |
|---|---|---|
| `ACCOUNTING SETUP` | Dispatch to Accounting/Ledger service for GL asset postings | Service call (stub) |
| `GPS ACTIVATION` | Ping physical GPS APIs to confirm device sync | Service call (stub) |
| `ACTIVE — AVAILABLE` | Auto-generate preventative maintenance schedule | Service call (stub) |
| `TRANSFER COMPLETE` → `AVAILABLE` | Update `purchaseDetails.branch` to destination branch | In-engine |
| `ACTIVE — RENTED` | Notify rental/booking module | Service call (stub) |
| `SUSPENDED` | Capture `previousStatus` for future restoration | In-engine |
| `RETIRED` | Final depreciation entry, archive vehicle data | Service call (stub) |

> [!NOTE]
> Side effects marked (stub) are currently `console.log` placeholders awaiting integration with their respective modules.

---

## 9. Audit Trail

Every status transition appends to `statusHistory[]`:

```json
{
  "status": "DOCUMENTS REVIEW",
  "changedBy": "ObjectId (user)",
  "changedByRole": "OPERATIONSTAFF",
  "timestamp": "Date.now (auto)",
  "notes": "Status changed from PENDING ENTRY to DOCUMENTS REVIEW"
}
```

The full `statusHistory` array provides a complete, immutable timeline of every state change the vehicle has gone through, from creation to retirement.

---

## 10. Validation Rules Summary

| Field/Area | Rule |
|---|---|
| `basicDetails.vin` | Required, unique, uppercase, trimmed |
| `basicDetails.make`, `model`, `year` | Required |
| `purchaseDetails.branch` | Required (Branch ObjectId) |
| `legalDocs` (3 mandatory) | Reg cert, road tax, roadworthiness must exist before `DOCUMENTS REVIEW` |
| `insurancePolicy` (5 mandatory) | Type, provider, policy number, start, expiry before `INSURANCE VERIFICATION` |
| `inspection.checklistItems` | Exactly 23 items required |
| `inspection.exteriorPhotos` | Minimum 6 photos |
| `inspection.odometerPhoto` | Required |
| `accountingSetup.isSetupComplete` | Must be `true` before `GPS ACTIVATION` |
| `gpsConfiguration.isActivated` | Must be `true` before `BRANCH MANAGER APPROVAL` |
| Expiry checks (rental) | Registration, road tax, insurance must all be non-expired |
| `importationDetails.landedCost` | Auto-computed, never client-supplied |
| `suspensionDetails.reason` | Required for `SUSPENDED` |
| `transferDetails.toBranch` | Required for `TRANSFER PENDING`, must differ from current |
| `retirementDetails.reason` | Required for `RETIRED` |

---

## 11. Database Indexes

| Index | Purpose |
|---|---|
| `status: 1` | Fast filtering by onboarding stage / fleet status |
| `purchaseDetails.branch: 1` | Branch-level queries and dashboards |
| `legalDocs.registrationNumber: 1` | Registration lookups |
| `basicDetails.vin: 1` | VIN uniqueness checks |
| `insurancePolicy.expiryDate: 1` | Expiry alert queries |
| `legalDocs.registrationExpiry: 1` | Expiry alert queries |
| `legalDocs.roadTaxExpiry: 1` | Expiry alert queries |

---

## 12. Model Changes Required

The following changes to `VehicleModel.js` are needed to support v3.0:

### 12.1 New Status Values

Add to `VEHICLE_STATUSES` array:
- `"INSURANCE VERIFICATION"`
- `"SUSPENDED"`
- `"TRANSFER PENDING"`
- `"TRANSFER COMPLETE"`

### 12.2 New Schema Fields

```javascript
// Suspension tracking
suspensionDetails: {
    reason: { type: String, enum: ["Accident", "Legal", "Police", "Dispute", "Other"] },
    suspendedUntil: { type: Date },
    previousStatus: { type: String, enum: VEHICLE_STATUSES },
},

// Transfer tracking
transferDetails: {
    fromBranch: { type: mongoose.Schema.Types.ObjectId, ref: "Branch" },
    toBranch: { type: mongoose.Schema.Types.ObjectId, ref: "Branch" },
    reason: { type: String },
    estimatedArrival: { type: Date },
    transportMethod: { type: String, enum: ["Driven", "Flatbed", "Shipping"] },
    initiatedBy: { type: mongoose.Schema.Types.ObjectId, refPath: "transferDetails.initiatedByRole" },
    initiatedByRole: { type: String },
    transferDate: { type: Date },
},

// Retirement tracking
retirementDetails: {
    reason: { type: String, enum: ["Sold", "Written Off", "End of Life", "Beyond Repair"] },
    disposalDate: { type: Date },
    disposalValue: { type: Number },
},

// Maintenance tracking (optional enhancement)
maintenanceDetails: {
    type: { type: String, enum: ["Scheduled", "Unscheduled", "Emergency"] },
    estimatedCompletionDate: { type: Date },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, refPath: "maintenanceDetails.assignedToRole" },
    assignedToRole: { type: String },
},
```

### 12.3 New Indexes

```javascript
vehicleSchema.index({ "insurancePolicy.expiryDate": 1 });
vehicleSchema.index({ "legalDocs.registrationExpiry": 1 });
vehicleSchema.index({ "legalDocs.roadTaxExpiry": 1 });
```
