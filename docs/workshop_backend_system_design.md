# Workshop & Maintenance — Backend System Design v2.0

> **Module:** Workshop & Maintenance  
> **Platform:** OlaCars Fleet Management  
> **Architecture:** Routes → Controller → Service → Repository → Model  
> **Last Updated:** March 5, 2026

---

## 1. Overview

This document defines the **complete backend workflow** for vehicle repairs, maintenance, and service operations. It covers work order lifecycle, inventory management, labour tracking, quality control, billing, and insurance claims.

### Modules Involved

| Module | Responsibility |
|--------|---------------|
| **WorkOrder** | Core work orders — lifecycle, state machine, tasks |
| **Inventory** | Parts stock management, reservations, procurement |
| **ServiceBill** | Billing, cost breakdown, accounting journal entries |
| **InsuranceClaim** | Accident/incident insurance claim lifecycle |

### Existing Modules Referenced

| Module | Integration Point |
|--------|-------------------|
| **Vehicle** | `ACTIVE — MAINTENANCE` status, `maintenanceDetails` field |
| **WorkshopStaff** | Assigned technicians |
| **Branch** | Location context for work orders |
| **PurchaseOrder** | Parts procurement |

---

## 2. Work Order Types

| Type | Code | Trigger | Description |
|------|------|---------|-------------|
| Preventive Maintenance | `PREVENTIVE` | Scheduled (km/time) | Oil change, tyre rotation, filters |
| Corrective / Breakdown | `CORRECTIVE` | Driver/staff report | Unplanned fix for a fault |
| Pre-Entry Inspection Repair | `PRE_ENTRY` | Onboarding workflow | Fix issues found in vehicle onboarding inspection |
| Accident / Incident | `ACCIDENT` | Incident report | Collision/damage repair with optional insurance claim |
| Return Inspection | `RETURN_INSPECTION` | End of rental | Repair damage found during vehicle return |
| Recall / Warranty | `RECALL` | Manufacturer notice | Factory-mandated fix, may be cost-free |
| Annual Safety Prep | `SAFETY_PREP` | Calendar schedule | Annual safety certificate prep |
| Wear Item Replacement | `WEAR_ITEM` | Inspection flag | Brakes, tyres, wipers, belts |

---

## 3. Work Order State Machine

### 3.1 Statuses

```
DRAFT
PENDING_APPROVAL
APPROVED
REJECTED
VEHICLE_CHECKED_IN
PARTS_REQUESTED
PARTS_RECEIVED
IN_PROGRESS
PAUSED
ADDITIONAL_WORK_FOUND
QUALITY_CHECK
FAILED_QC
READY_FOR_RELEASE
VEHICLE_RELEASED
INVOICED
CLOSED
CANCELLED
```

### 3.2 Status Flow Diagram

```
DRAFT
  ↓
PENDING_APPROVAL ──→ REJECTED ──→ (DRAFT — rework)
  ↓
APPROVED
  ↓
VEHICLE_CHECKED_IN
  ↓
PARTS_REQUESTED ──→ PARTS_RECEIVED
  ↓                     ↓
  └─────────────────→ IN_PROGRESS ←── (PAUSED — resume)
                          ↓
                    ADDITIONAL_WORK_FOUND ──→ PENDING_APPROVAL (sub-WO or re-approval)
                          ↓
                    QUALITY_CHECK
                     ↓          ↓
              FAILED_QC     READY_FOR_RELEASE
              (→ IN_PROGRESS)     ↓
                            VEHICLE_RELEASED
                                  ↓
                              INVOICED
                                  ↓
                               CLOSED

CANCELLED ← (can cancel from DRAFT, PENDING_APPROVAL, APPROVED, REJECTED)
```

### 3.3 Transition Rules

| Target Status | Allowed From | Allowed Roles | Min Hierarchy | Gate Validation |
|--------------|-------------|---------------|---------------|-----------------|
| `DRAFT` | — | WorkshopStaff, OperationStaff | BranchManager | — |
| `PENDING_APPROVAL` | DRAFT, ADDITIONAL_WORK_FOUND | WorkshopStaff, OperationStaff | BranchManager | Estimated cost must be > 0 |
| `APPROVED` | PENDING_APPROVAL | BranchManager, CountryManager | Admin | Cost approval threshold check |
| `REJECTED` | PENDING_APPROVAL | BranchManager, CountryManager | Admin | Rejection reason required |
| `VEHICLE_CHECKED_IN` | APPROVED | WorkshopStaff | BranchManager | Vehicle must be in `ACTIVE — MAINTENANCE` |
| `PARTS_REQUESTED` | VEHICLE_CHECKED_IN, IN_PROGRESS | WorkshopStaff | BranchManager | At least one part line item |
| `PARTS_RECEIVED` | PARTS_REQUESTED | WorkshopStaff, OperationStaff | BranchManager | All critical parts marked received |
| `IN_PROGRESS` | VEHICLE_CHECKED_IN, PARTS_RECEIVED, PAUSED, FAILED_QC | WorkshopStaff | BranchManager | Technician must be assigned |
| `PAUSED` | IN_PROGRESS | WorkshopStaff | BranchManager | Pause reason required |
| `ADDITIONAL_WORK_FOUND` | IN_PROGRESS | WorkshopStaff | BranchManager | Additional scope description + revised estimate |
| `QUALITY_CHECK` | IN_PROGRESS | WorkshopStaff | BranchManager | All tasks marked complete |
| `FAILED_QC` | QUALITY_CHECK | WorkshopStaff, OperationStaff | BranchManager | At least one QC item failed + notes |
| `READY_FOR_RELEASE` | QUALITY_CHECK | WorkshopStaff, OperationStaff | BranchManager | All QC items passed, min 4 photos |
| `VEHICLE_RELEASED` | READY_FOR_RELEASE | WorkshopStaff, OperationStaff | BranchManager | Final odometer reading captured |
| `INVOICED` | VEHICLE_RELEASED | FinanceStaff | FinanceAdmin | Service bill generated and linked |
| `CLOSED` | INVOICED | FinanceStaff, BranchManager | Admin | Service bill approved |
| `CANCELLED` | DRAFT, PENDING_APPROVAL, APPROVED, REJECTED | BranchManager | CountryManager | Cancellation reason required |

---

## 4. Cost Approval Logic

Work order cost determines who must approve:

| Estimated Total Cost | Approver | Auto/Manual |
|---------------------|----------|-------------|
| ≤ $200 | System | **Auto-approved** |
| $201 – $1,000 | BranchManager | Manual |
| $1,001 – $5,000 | CountryManager | Manual |
| > $5,000 | Admin | Manual |

### Re-approval Trigger
If `ADDITIONAL_WORK_FOUND` increases the estimated cost **by more than 20%** or crosses a threshold boundary, the work order loops back to `PENDING_APPROVAL`.

---

## 5. Work Order Data Model

### 5.1 WorkOrder (Main Document)

```
workOrderNumber         String    Auto-generated (WO-BRANCH-YYYYMM-XXXX)
workOrderType           String    Enum of work order types (Section 2)
status                  String    Enum of statuses (Section 3.1)

vehicleId               ObjectId  → Vehicle
branchId                ObjectId  → Branch

priority                String    "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"
slaDeadline             Date      Auto-calculated from priority

faultDescription        String    Required
reportedBy              ObjectId  Ref to any staff/user
reportedByRole          String

assignedTechnician      ObjectId  → WorkshopStaff
supervisedBy            ObjectId  → BranchManager / OperationStaff

odometerAtEntry         Number    Captured at vehicle check-in
odometerAtRelease       Number    Captured at vehicle release

estimatedLabourHours    Number
actualLabourHours       Number    Accumulated from labour log
estimatedPartsCost      Number
actualPartsCost         Number    Summed from parts used
estimatedTotalCost      Number    Labour + Parts estimate
actualTotalCost         Number    Final total

costApproval            Object {
  approvedBy            ObjectId
  approvedByRole        String
  approvedAt            Date
  thresholdLevel        String    "AUTO" | "BRANCH" | "COUNTRY" | "ADMIN"
  rejectionReason       String
}

parts                   Array of WorkOrderPart (embedded or referenced)
tasks                   Array of WorkOrderTask (embedded)
labourLog               Array of LabourEntry (embedded)
qcChecklist             Array of QCItem (embedded)
qcPhotos                [String]  S3 URLs, min 4 required

notes                   String
additionalWorkScope     String    Populated on ADDITIONAL_WORK_FOUND
cancellationReason      String
pauseReason             String

serviceBillId           ObjectId  → ServiceBill (linked after INVOICED)
insuranceClaimId        ObjectId  → InsuranceClaim (if ACCIDENT type)

statusHistory           Array of {
  status                String
  changedBy             ObjectId
  changedByRole         String
  timestamp             Date
  notes                 String
}

createdBy               ObjectId
creatorRole             String
isDeleted               Boolean
```

### 5.2 WorkOrderTask (Embedded Sub-document)

```
description             String    Required
category                String    "Mechanical" | "Electrical" | "Body" | "Tyres" | "Fluids" | "Other"
status                  String    "PENDING" | "IN_PROGRESS" | "COMPLETED" | "SKIPPED"
assignedTo              ObjectId  → WorkshopStaff (can differ from main technician)
estimatedHours          Number
actualHours             Number
completedAt             Date
notes                   String
```

### 5.3 WorkOrderPart (Embedded Sub-document)

```
partName                String    Required
partNumber              String
quantity                Number    Required
unitCost                Number
totalCost               Number    Auto: quantity × unitCost
source                  String    "IN_STOCK" | "ORDERED" | "EXTERNAL_VENDOR"
inventoryPartId         ObjectId  → InventoryPart (if from stock)
purchaseOrderId         ObjectId  → PurchaseOrder (if ordered)
status                  String    "REQUESTED" | "RESERVED" | "RECEIVED" | "INSTALLED" | "RETURNED"
receivedDate            Date
installedBy             ObjectId
```

### 5.4 LabourEntry (Embedded Sub-document)

```
technicianId            ObjectId  → WorkshopStaff
action                  String    "CLOCK_IN" | "CLOCK_OUT" | "PAUSE" | "RESUME"
timestamp               Date
taskReference           String    Optional link to a specific task
notes                   String
```

> **Labour Calculation:** The service sums paired `CLOCK_IN`→`CLOCK_OUT` intervals (excluding `PAUSE`→`RESUME` gaps) to compute `actualLabourHours`.

### 5.5 QCItem (Embedded Sub-document)

```
name                    String    Required
category                String    "Fluids" | "Brakes" | "Tyres" | "Electrical" | "Engine" | "Body" | "Safety"
result                  String    "PASS" | "FAIL" | "N/A"
notes                   String
isMandatory             Boolean   If true, FAIL blocks vehicle release
```

---

## 6. SLA & Priority

| Priority | SLA Deadline | Use Case |
|----------|-------------|----------|
| `CRITICAL` | 4 hours | Safety hazard, accident, breakdown on road |
| `HIGH` | 24 hours | Major fault, vehicle cannot operate |
| `MEDIUM` | 72 hours | Non-critical repair, scheduled maintenance |
| `LOW` | 7 days | Cosmetic, minor wear items |

The backend auto-sets `slaDeadline` based on priority at work order creation. The system can flag **SLA breaches** for dashboard reporting.

---

## 7. Inventory Integration

### Flow

```
1. Technician adds parts to WO           → Part status: REQUESTED
2. System checks InventoryPart stock
   a. In stock → Reserve quantity         → Part status: RESERVED
   b. Out of stock → Create procurement   → PurchaseOrder created
3. Parts arrive at workshop               → Part status: RECEIVED
4. Technician installs part               → Part status: INSTALLED
   → InventoryPart.quantityOnHand decremented
5. If unused part returned                → Part status: RETURNED
   → InventoryPart.quantityOnHand incremented back
```

### InventoryPart Data Model

```
partName                String    Required
partNumber              String    Unique
category                String    "Engine" | "Electrical" | "Body" | "Tyres" | "Fluids" | "Brakes" | "Filters" | "Other"
unit                    String    "piece" | "litre" | "set" | "metre"
unitCost                Number
quantityOnHand          Number
quantityReserved        Number
reorderLevel            Number    Alert when quantityOnHand ≤ reorderLevel
branchId                ObjectId  → Branch (stock is per-branch)
supplierId              ObjectId  → Supplier (preferred supplier)
isActive                Boolean
```

---

## 8. Billing & Service Bill

### ServiceBill Data Model

```
billNumber              String    Auto-generated (SB-YYYYMM-XXXX)
workOrderId             ObjectId  → WorkOrder
vehicleId               ObjectId  → Vehicle
branchId                ObjectId  → Branch

lineItems               Array of LineItem {
  description           String
  category              String    "PARTS" | "LABOUR" | "EXTERNAL_VENDOR" | "OVERHEAD"
  quantity              Number
  unitPrice             Number
  totalPrice            Number
}

subtotal                Number    Sum of lineItems
taxAmount               Number    Linked to Tax module
totalAmount             Number    subtotal + taxAmount

labourSummary           Object {
  totalHours            Number
  hourlyRate            Number
  totalLabourCost       Number
}

paymentStatus           String    "PENDING" | "PARTIALLY_PAID" | "PAID" | "WAIVED"
isInsuranceClaim        Boolean
insuranceClaimId        ObjectId
insuranceCoveredAmount  Number

approvedBy              ObjectId
approvedAt              Date

accountingEntries       Array of {
  type                  String    "DEBIT" | "CREDIT"
  accountCode           String    → AccountingCode
  amount                Number
  description           String
}
```

### Standard Accounting Entries

| Scenario | Debit | Credit |
|----------|-------|--------|
| Normal repair | Vehicle Maintenance Expense | Parts Inventory / Cash |
| Insurance claim | Insurance Receivable | Vehicle Maintenance Expense |
| Warranty/Recall | Warranty Receivable | Vehicle Maintenance Expense |
| Customer damage | Customer Receivable / Deposit | Vehicle Maintenance Expense |

---

## 9. Insurance Claim Lifecycle

For `ACCIDENT` type work orders:

```
CLAIM_DRAFTED       → Claim details captured alongside WO
CLAIM_SUBMITTED     → Sent to insurance provider
UNDER_REVIEW        → Awaiting insurer response
CLAIM_APPROVED      → Amount confirmed
CLAIM_REJECTED      → Insurer denies (company absorbs cost)
PAYMENT_RECEIVED    → Insurer payment recorded
CLOSED              → Reconciled with service bill
```

### InsuranceClaim Data Model

```
claimNumber             String    Auto-generated
workOrderId             ObjectId  → WorkOrder
vehicleId               ObjectId  → Vehicle
incidentDate            Date
incidentDescription     String
policeReportNumber      String
insurerName             String    From vehicle's insurancePolicy.providerName
policyNumber            String    From vehicle's insurancePolicy.policyNumber
claimAmount             Number
approvedAmount          Number
status                  String    Enum (see above)
documents               [String]  S3 URLs (photos, reports, estimates)
paymentReference        String
paymentDate             Date
notes                   String
createdBy               ObjectId
```

---

## 10. Side Effects & Automation

| Trigger | Side Effect |
|---------|-------------|
| WO created for vehicle | Vehicle status → `ACTIVE — MAINTENANCE` (via Vehicle workflow) |
| WO `VEHICLE_RELEASED` | Vehicle status → `ACTIVE — AVAILABLE` (via Vehicle workflow) |
| Cost ≤ $200 | `costApproval` auto-populated, status → `APPROVED` |
| Part `RESERVED` | `InventoryPart.quantityReserved` incremented |
| Part `INSTALLED` | `InventoryPart.quantityOnHand` decremented |
| Part `RETURNED` | `InventoryPart.quantityOnHand` incremented |
| `quantityOnHand ≤ reorderLevel` | Log reorder alert (future: notification) |
| ACCIDENT WO created | InsuranceClaim auto-drafted |
| SLA deadline passed | Flag for dashboard reporting |
| WO `CANCELLED` | Release all reserved parts back to inventory |
| `ADDITIONAL_WORK_FOUND` cost increase > 20% | Loop back to `PENDING_APPROVAL` |

---

## 11. API Endpoints

### Work Orders

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/work-orders` | Create new work order (DRAFT) |
| `GET` | `/api/work-orders` | List work orders (filter: status, branch, vehicle, priority) |
| `GET` | `/api/work-orders/:id` | Get work order detail |
| `PUT` | `/api/work-orders/:id/progress` | Unified status transition (like vehicle module) |
| `PUT` | `/api/work-orders/:id/tasks` | Add/update tasks |
| `PUT` | `/api/work-orders/:id/parts` | Add/update parts |
| `POST` | `/api/work-orders/:id/labour` | Log labour entry (clock in/out/pause/resume) |
| `PUT` | `/api/work-orders/:id/qc` | Submit QC checklist |
| `POST` | `/api/work-orders/:id/upload-photos` | Upload QC/repair photos to S3 |

### Inventory

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/inventory` | Add new part to inventory |
| `GET` | `/api/inventory` | List parts (filter: branch, category, low stock) |
| `GET` | `/api/inventory/:id` | Get part detail |
| `PUT` | `/api/inventory/:id` | Update part details/stock |
| `DELETE` | `/api/inventory/:id` | Soft delete |

### Service Bills

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/service-bills` | Generate bill from completed WO |
| `GET` | `/api/service-bills` | List bills |
| `GET` | `/api/service-bills/:id` | Get bill detail |
| `PUT` | `/api/service-bills/:id/approve` | Approve bill |

### Insurance Claims

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/insurance-claims` | Create claim |
| `GET` | `/api/insurance-claims` | List claims |
| `GET` | `/api/insurance-claims/:id` | Get claim detail |
| `PUT` | `/api/insurance-claims/:id/progress` | Update claim status |

---

## 12. Implementation Phases

| Phase | Scope | Dependencies |
|-------|-------|-------------|
| **Phase 1** | WorkOrder Model + CRUD + State Machine + Status Transitions | Vehicle module (maintenance status) |
| **Phase 2** | Tasks, Parts (embedded), Labour Tracking | Phase 1 |
| **Phase 3** | InventoryPart Module (full CRUD + stock management) | Phase 2 |
| **Phase 4** | ServiceBill Module + Billing + Accounting Entries | Phase 3, AccountingCode module |
| **Phase 5** | InsuranceClaim Module + Accident Workflow | Phase 4 |
| **Phase 6** | QC Checklist + S3 Photo Uploads + Vehicle Release Flow | Phase 2 |

---

## 13. Work Order Completion Checklist

Before a work order can reach `CLOSED`:

- [ ] All tasks status = `COMPLETED` or `SKIPPED`
- [ ] All parts status = `INSTALLED` or `RETURNED`
- [ ] Labour hours finalized (`actualLabourHours` calculated)
- [ ] QC passed (all mandatory items = `PASS`)
- [ ] Minimum 4 QC photos uploaded
- [ ] Final odometer reading captured
- [ ] Service bill generated and approved
- [ ] Insurance claim settled (if ACCIDENT type)

---

*End of Document*
