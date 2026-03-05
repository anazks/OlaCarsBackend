# Workshop & Maintenance — API Reference

> **Base URL**: `/api`
> **Auth**: All endpoints require `Authorization: Bearer <token>`
> **Date**: 2026-03-05

---

## Table of Contents

1. [Work Orders](#1-work-orders)
2. [Tasks](#2-tasks-sub-resource-of-work-order)
3. [Parts](#3-parts-sub-resource-of-work-order)
4. [Labour Tracking](#4-labour-tracking)
5. [Quality Check (QC)](#5-quality-check)
6. [Photos](#6-photos)
7. [Vehicle Release](#7-vehicle-release)
8. [Inventory](#8-inventory)
9. [Service Bills](#9-service-bills)
10. [Insurance Claims](#10-insurance-claims)
11. [Enums & Constants](#11-enums--constants)
12. [Status Flow Diagrams](#12-status-flow-diagrams)

---

## 1. Work Orders

### `POST /api/work-orders` — Create Work Order

Creates a new work order in **DRAFT** status.

**Body:**
```json
{
  "workOrderType": "CORRECTIVE",       // required — see enum below
  "vehicleId": "ObjectId",             // required
  "branchId": "ObjectId",              // required
  "faultDescription": "Brake noise",   // required
  "priority": "HIGH",                  // optional, default MEDIUM
  "assignedTechnician": "ObjectId",    // optional
  "estimatedLabourHours": 4,           // optional
  "estimatedPartsCost": 200,           // optional
  "notes": "Customer reported"         // optional
}
```

**Response** `201`:
```json
{ "success": true, "data": { /* WorkOrder object */ } }
```

---

### `GET /api/work-orders` — List Work Orders

**Query Params:**
| Param | Type | Description |
|-------|------|-------------|
| `status` | string | Filter by status |
| `branchId` | ObjectId | Filter by branch |
| `vehicleId` | ObjectId | Filter by vehicle |
| `priority` | string | `LOW` / `MEDIUM` / `HIGH` / `CRITICAL` |
| `workOrderType` | string | Filter by type |

**Response** `200`: `{ "success": true, "data": [WorkOrder[]] }`

---

### `GET /api/work-orders/:id` — Get Work Order

**Response** `200`: `{ "success": true, "data": { /* full WorkOrder */ } }`

---

### `PUT /api/work-orders/:id/progress` — Transition Status

Unified workflow endpoint. Moves the work order through the state machine.

**Body:**
```json
{
  "targetStatus": "APPROVED",          // required — see status enum
  "notes": "All looks good",           // optional — saved in audit trail
  "updateData": {                      // optional — additional fields to set
    "odometerAtEntry": 45000,
    "assignedTechnician": "ObjectId",
    "pauseReason": "Waiting for parts",
    "cancellationReason": "...",
    "rejectionReason": "..."
  }
}
```

**Errors:**
- `400` — Invalid transition, gate validation failed
- `403` — Role not authorized for this transition
- `404` — Work order not found

---

## 2. Tasks (sub-resource of Work Order)

### `POST /api/work-orders/:id/tasks` — Add Task

```json
{
  "description": "Replace brake pads",  // required
  "category": "Brakes",                 // Mechanical|Electrical|Body|Tyres|Fluids|Other
  "assignedTo": "ObjectId",             // optional
  "estimatedHours": 2,                  // optional
  "notes": "Front axle only"            // optional
}
```
**Response** `201`

### `PUT /api/work-orders/:id/tasks/:taskId` — Update Task

```json
{
  "status": "COMPLETED",       // PENDING|IN_PROGRESS|COMPLETED|SKIPPED
  "actualHours": 1.5,
  "notes": "Done"
}
```
> `completedAt` is auto-set when status = `COMPLETED`.

### `DELETE /api/work-orders/:id/tasks/:taskId` — Remove Task

Only tasks with status `PENDING` can be removed.

---

## 3. Parts (sub-resource of Work Order)

### `POST /api/work-orders/:id/parts` — Add Part

```json
{
  "partName": "Brake Pad Set",       // required
  "partNumber": "BP-2024-FR",       // optional
  "quantity": 2,                     // required
  "unitCost": 45,                    // optional
  "source": "IN_STOCK"              // IN_STOCK|ORDERED|EXTERNAL_VENDOR
}
```
> `totalCost` = `quantity × unitCost` (auto-calculated).
> `actualPartsCost` on the WO is auto-recalculated.

### `PUT /api/work-orders/:id/parts/:partId` — Update Part

```json
{
  "status": "INSTALLED",             // REQUESTED|RESERVED|RECEIVED|INSTALLED|RETURNED
  "quantity": 2,
  "unitCost": 50,
  "receivedDate": "2026-03-05T10:00:00Z",
  "installedBy": "ObjectId",
  "source": "ORDERED"
}
```

### `DELETE /api/work-orders/:id/parts/:partId` — Remove Part

Only parts with status `REQUESTED` can be removed.

---

## 4. Labour Tracking

### `POST /api/work-orders/:id/labour` — Log Entry

```json
{
  "action": "CLOCK_IN",              // required: CLOCK_IN|CLOCK_OUT|PAUSE|RESUME
  "technicianId": "ObjectId",        // optional — defaults to current user
  "taskReference": "Task description",
  "notes": "Starting work"
}
```

**Action sequence must follow:** `CLOCK_IN → (PAUSE → RESUME)* → CLOCK_OUT`

> `actualLabourHours` on the WO is auto-calculated on `CLOCK_OUT`.

---

## 5. Quality Check

### `POST /api/work-orders/:id/qc/generate` — Generate QC Checklist

Auto-generates a type-specific QC checklist (PREVENTIVE, CORRECTIVE, ACCIDENT, or DEFAULT template). No body required.

**Response** `201`: Array of checklist items with `result: "PENDING"`.

### `PUT /api/work-orders/:id/qc/submit` — Submit QC Results

WO must be in `QUALITY_CHECK` status.

```json
{
  "results": [
    { "checkItem": "Engine oil level and condition", "result": "PASS", "notes": "" },
    { "checkItem": "Brake pads condition", "result": "FAIL", "notes": "Worn below spec" }
  ]
}
```

**Response**: `{ passed: true/false, failedItems: [...], pending: [...] }`

---

## 6. Photos

### `POST /api/work-orders/:id/photos` — Add Photo

```json
{
  "url": "https://s3.amazonaws.com/bucket/photo.jpg",  // required
  "caption": "Front bumper damage",                     // optional
  "stage": "CHECK_IN"                                   // CHECK_IN|IN_PROGRESS|QC|RELEASE
}
```

---

## 7. Vehicle Release

### `PUT /api/work-orders/:id/release` — Release Vehicle

WO must be in `READY_FOR_RELEASE` status. QC must be fully passed.

```json
{
  "odometerAtRelease": 45100,
  "releaseNotes": "All repairs complete"
}
```

> Transitions WO to `VEHICLE_RELEASED` and syncs vehicle status back to **ACTIVE**.

---

## 8. Inventory

### `POST /api/inventory` — Create Part

```json
{
  "partName": "Brake Pad Set",         // required
  "partNumber": "BP-2024-FR",          // required, unique
  "category": "Brakes",                // required — see enum
  "unitCost": 45,                      // required
  "branchId": "ObjectId",              // required
  "unit": "piece",                     // piece|litre|kg|metre|set|pair|box
  "quantityOnHand": 50,
  "reorderLevel": 10,
  "supplierId": "ObjectId",
  "description": "OEM front pads"
}
```

### `GET /api/inventory` — List Parts

| Param | Type | Description |
|-------|------|-------------|
| `branchId` | ObjectId | Filter by branch |
| `category` | string | Filter by category |
| `supplierId` | ObjectId | Filter by supplier |
| `lowStock` | `"true"` | Only parts at or below reorder level |
| `search` | string | Search by name or part number |

### `GET /api/inventory/low-stock/:branchId` — Low Stock Alert

Returns all parts where `quantityOnHand ≤ reorderLevel`.

### `GET /api/inventory/:id` — Get Part

### `PUT /api/inventory/:id` — Update Part

### `DELETE /api/inventory/:id` — Deactivate Part (soft delete)

### `PUT /api/inventory/:id/restock` — Add Stock

```json
{ "quantity": 20 }
```

### `PUT /api/inventory/:id/reserve` — Reserve for Work Order

```json
{ "quantity": 2 }
```
Returns `400` with `shortfall` if insufficient stock.

### `PUT /api/inventory/:id/release` — Release Reservation

```json
{ "quantity": 2 }
```

### `PUT /api/inventory/:id/install` — Confirm Installation

Deducts from both `quantityOnHand` and `quantityReserved`.

```json
{ "quantity": 2 }
```

---

## 9. Service Bills

### `POST /api/service-bills` — Generate Bill from Work Order

WO must be in `VEHICLE_RELEASED`, `INVOICED`, or `CLOSED`.

```json
{
  "workOrderId": "ObjectId",       // required
  "taxRate": 15,                   // optional, percentage
  "hourlyRate": 60,                // optional, default 50
  "discount": 100,                 // optional
  "notes": "Priority service"      // optional
}
```

**Auto-generates:**
- Line items from WO parts (INSTALLED/RECEIVED) and labour hours
- Subtotal, tax, discount, total
- Accounting journal entries (DEBIT expense, CREDIT payable, DEBIT input tax)
- Bill number `SB-YYYYMM-XXXX`

### `GET /api/service-bills` — List Bills

| Param | Type | Description |
|-------|------|-------------|
| `status` | string | DRAFT / PENDING_APPROVAL / APPROVED / PAID / VOID |
| `branchId` | ObjectId | |
| `workOrderId` | ObjectId | |
| `paymentStatus` | string | UNPAID / PARTIAL / PAID |

### `GET /api/service-bills/:id` — Get Bill

### `PUT /api/service-bills/:id/approve` — Approve Bill

No body required. Sets `approvedBy`, `approvedAt`.

### `PUT /api/service-bills/:id/pay` — Mark Paid

```json
{
  "paymentMethod": "Bank Transfer",      // Cash|Bank Transfer|Credit Card|Insurance|Internal
  "paymentReference": "TXN-12345"
}
```

### `PUT /api/service-bills/:id/void` — Void Bill

```json
{ "reason": "Duplicate bill created" }
```

---

## 10. Insurance Claims

### `POST /api/insurance-claims` — Create Claim

Only for `ACCIDENT` type work orders. Auto-populates insurer/policy from vehicle.

```json
{
  "workOrderId": "ObjectId",               // required
  "incidentDate": "2026-03-01T08:00:00Z",  // required
  "incidentDescription": "Rear collision",  // required
  "claimAmount": 5000,                      // required
  "incidentLocation": "Highway 5",          // optional
  "policeReportNumber": "PR-2026-001",      // optional
  "excessAmount": 500,                      // optional
  "notes": "Third party at fault"           // optional
}
```

### `GET /api/insurance-claims` — List Claims

| Param | Type |
|-------|------|
| `status` | string |
| `branchId` | ObjectId |
| `vehicleId` | ObjectId |
| `workOrderId` | ObjectId |

### `GET /api/insurance-claims/:id` — Get Claim

### `PUT /api/insurance-claims/:id/progress` — Transition Claim Status

```json
{
  "targetStatus": "APPROVED",          // required
  "approvedAmount": 4500,             // required for APPROVED
  "rejectionReason": "...",            // required for REJECTED
  "paymentReference": "INS-PAY-001",   // required for PAYMENT_RECEIVED
  "paymentAmount": 4000,              // required for PAYMENT_RECEIVED
  "notes": "Reviewed and approved"     // optional
}
```

---

## 11. Enums & Constants

### Work Order Statuses
```
DRAFT → PENDING_APPROVAL → APPROVED → VEHICLE_CHECKED_IN → PARTS_REQUESTED →
PARTS_RECEIVED → IN_PROGRESS → QUALITY_CHECK → READY_FOR_RELEASE → VEHICLE_RELEASED →
INVOICED → CLOSED

Side branches:
  APPROVED → REJECTED
  IN_PROGRESS → PAUSED → IN_PROGRESS
  IN_PROGRESS → ADDITIONAL_WORK_FOUND → PENDING_APPROVAL
  QUALITY_CHECK → FAILED_QC → IN_PROGRESS
  Any → CANCELLED
```

### Work Order Types
`PREVENTIVE` · `CORRECTIVE` · `PRE_ENTRY` · `ACCIDENT` · `RETURN_INSPECTION` · `RECALL` · `SAFETY_PREP` · `WEAR_ITEM`

### Priorities
`LOW` (SLA 7d) · `MEDIUM` (SLA 72h) · `HIGH` (SLA 24h) · `CRITICAL` (SLA 4h)

### Task Statuses
`PENDING` → `IN_PROGRESS` → `COMPLETED` / `SKIPPED`

### Part Statuses
`REQUESTED` → `RESERVED` → `RECEIVED` → `INSTALLED` / `RETURNED`

### Labour Actions
`CLOCK_IN` → `PAUSE` → `RESUME` → `CLOCK_OUT`

### Inventory Categories
`Engine` · `Transmission` · `Brakes` · `Suspension` · `Electrical` · `Body` · `Tyres` · `Fluids` · `Filters` · `Belts` · `Cooling` · `Exhaust` · `Interior` · `Other`

### Bill Statuses
`DRAFT` → `PENDING_APPROVAL` → `APPROVED` → `PAID` / `VOID`

### Claim Statuses
`DRAFT` → `SUBMITTED` → `UNDER_REVIEW` → `APPROVED` / `REJECTED` → `PAYMENT_RECEIVED` → `CLOSED`

---

## 12. Status Flow Diagrams

### Work Order Flow
```
DRAFT
  └─→ PENDING_APPROVAL
        ├─→ APPROVED
        │     └─→ VEHICLE_CHECKED_IN
        │           └─→ PARTS_REQUESTED → PARTS_RECEIVED
        │           └─→ IN_PROGRESS
        │                 ├─→ PAUSED → IN_PROGRESS
        │                 ├─→ ADDITIONAL_WORK_FOUND → PENDING_APPROVAL
        │                 └─→ QUALITY_CHECK
        │                       ├─→ FAILED_QC → IN_PROGRESS
        │                       └─→ READY_FOR_RELEASE
        │                             └─→ VEHICLE_RELEASED
        │                                   └─→ INVOICED → CLOSED
        └─→ REJECTED
  └─→ CANCELLED (from any status)
```

### Insurance Claim Flow
```
DRAFT → SUBMITTED → UNDER_REVIEW → APPROVED → PAYMENT_RECEIVED → CLOSED
                                  → REJECTED → CLOSED
```

### Service Bill Flow
```
DRAFT → PENDING_APPROVAL → APPROVED → PAID
                                    → VOID
```
