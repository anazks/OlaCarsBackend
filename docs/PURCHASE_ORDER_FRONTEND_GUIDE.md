# Purchase Order — Frontend Developer Guide

## Overview

The Purchase Order (PO) module handles creating, approving/rejecting, and editing purchase orders. It uses **hierarchical approval** — only users above the creator's level can approve, with branch/country scoping.

---

## Role Hierarchy

| Level | Roles | Scope |
|-------|-------|-------|
| L1 | OperationStaff, FinanceStaff, WorkshopStaff | Own branch (from JWT) |
| L2 | BranchManager | Own branch (from JWT) |
| L3 | CountryManager | All branches in their country |
| L4 | OperationAdmin, FinanceAdmin | Global |
| L5 | Admin | Global |

---

## API Endpoints

**Base URL:** `/api/purchase-order`

| Method | Endpoint | Who | Description |
|--------|----------|-----|-------------|
| `POST` | `/` | Any authenticated | Create PO |
| `GET` | `/` | Any authenticated | List POs (role-scoped) |
| `GET` | `/:id` | Any authenticated | Get PO details |
| `PUT` | `/:id/approve` | BranchManager+ | Approve or reject |
| `PUT` | `/:id` | Creator or Admin | Edit PO |

**Auth:** All endpoints require `Authorization: Bearer <token>` header.

---

## 1. Create Purchase Order

```
POST /api/purchase-order
```

### Request Body

```json
{
  "items": [
    {
      "itemName": "Brake Pads",
      "quantity": 4,
      "description": "Ceramic brake pads for Toyota Corolla",
      "unitPrice": 45.00
    },
    {
      "itemName": "Oil Filter",
      "quantity": 2,
      "unitPrice": 12.50
    }
  ],
  "supplier": "65f1a2b3c4d5e6f7a8b9c0d2",
  "paymentDate": "2026-03-15T00:00:00.000Z",
  "branch": "65f1a2b3c4d5e6f7a8b9c0d1"
}
```

### Branch Logic
- **Staff / BranchManager:** `branch` field is **ignored** — auto-assigned from JWT. Don't send it (or hide it in the UI).
- **CountryManager+:** `branch` field is **required**. Show a branch dropdown filtered to their country.

### Auto-Calculated Fields (don't send)
- `purchaseOrderNumber` — auto-generated (`PO-{timestamp}-{random}`)
- `totalAmount` — auto-calculated from `items` (`sum of quantity × unitPrice`)
- `createdBy` / `creatorRole` — from JWT

### Response (201)
```json
{
  "success": true,
  "data": {
    "_id": "...",
    "purchaseOrderNumber": "PO-1709467200000-A1B2",
    "status": "WAITING",
    "items": [...],
    "totalAmount": 205.00,
    "branch": "...",
    "supplier": "...",
    "createdBy": "...",
    "creatorRole": "OPERATIONSTAFF",
    "createdAt": "..."
  }
}
```

---

## 2. List Purchase Orders

```
GET /api/purchase-order
```

Returns POs filtered by the caller's role automatically:

| Caller Role | What they see |
|-------------|---------------|
| Staff (L1) | Only their own POs |
| BranchManager | All POs from their branch |
| CountryManager | All POs from branches in their country |
| Semi-Admin / Admin | All POs |

### Response (200)
```json
{
  "success": true,
  "data": [
    {
      "_id": "...",
      "purchaseOrderNumber": "PO-1709467200000-A1B2",
      "status": "WAITING",
      "totalAmount": 205.00,
      "branch": { "_id": "...", "name": "Nairobi Branch" },
      "supplier": { "_id": "...", "name": "AutoParts Ltd", "contactPerson": "...", "email": "..." },
      "createdBy": "...",
      "creatorRole": "OPERATIONSTAFF",
      "createdAt": "..."
    }
  ]
}
```

---

## 3. Get Purchase Order by ID

```
GET /api/purchase-order/:id
```

Returns full PO with populated `branch`, `supplier`, and `createdBy` references.

---

## 4. Approve / Reject Purchase Order

```
PUT /api/purchase-order/:id/approve
```

### Request Body
```json
{
  "status": "APPROVED"
}
```
or
```json
{
  "status": "REJECTED"
}
```

### Approval Rules (enforced server-side)

| Rule | Description |
|------|-------------|
| **Hierarchy** | Approver's level must be **above** creator's level |
| **Branch scope** | BranchManager can only approve POs from their own branch |
| **Country scope** | CountryManager can only approve POs from their country's branches |
| **$1000 threshold** | POs > $1000 → **Admin only** |
| **No self-approval** | Creator cannot approve their own PO |
| **One-time only** | PO must be in `WAITING` status |

### Error Responses

| Code | When |
|------|------|
| `400` | Invalid status value, or PO already processed |
| `403` | Not authorized (hierarchy, scope, self-approval, or $1000 rule) |
| `404` | PO not found |

### UI Recommendations

- **Show/hide the Approve/Reject buttons** based on:
  1. PO status is `WAITING`
  2. Current user is NOT the creator
  3. Current user's role level > creator's role level
  4. If PO totalAmount > 1000 → only show for Admin
  5. BranchManager → only if PO is from their branch
  6. CountryManager → only if PO branch is in their country

- **Approval hierarchy quick-reference for the UI:**
  - Staff POs → BranchManager+ can approve
  - BranchManager POs → CountryManager+ can approve
  - CountryManager POs → Semi-Admin+ can approve
  - Semi-Admin POs → Admin can approve

---

## 5. Edit Purchase Order

```
PUT /api/purchase-order/:id
```

### Who Can Edit
- The **original creator** of the PO
- **Admin** (can edit any PO)

### What Happens on Edit
- Status **resets to `WAITING`** (requires re-approval)
- `totalAmount` is **recalculated** if items are changed
- An entry is added to `editHistory` with a human-readable change summary

### Request Body
```json
{
  "items": [
    {
      "itemName": "Brake Pads",
      "quantity": 6,
      "description": "Increased quantity",
      "unitPrice": 45.00
    },
    {
      "itemName": "Oil Filter",
      "quantity": 2,
      "unitPrice": 15.00
    }
  ],
  "supplier": "65f1a2b3c4d5e6f7a8b9c0d9",
  "paymentDate": "2026-04-01T00:00:00.000Z"
}
```

### UI Note
- Show an "Edited" badge if `isEdited === true`
- Show edit history in a timeline/accordion component

---

## PO Status Flow

```
┌──────────┐     ┌──────────┐
│  CREATE  │────▶│ WAITING  │◀──── (edit resets here)
└──────────┘     └────┬─────┘
                      │
              ┌───────┴───────┐
              ▼               ▼
        ┌──────────┐    ┌──────────┐
        │ APPROVED │    │ REJECTED │
        └──────────┘    └──────────┘
```

Only 3 statuses: `WAITING` → `APPROVED` or `REJECTED`. Edits reset back to `WAITING`.

---

## Data Schema Reference

### PurchaseOrder Object

| Field | Type | Description |
|-------|------|-------------|
| `_id` | String | Mongo ObjectId |
| `purchaseOrderNumber` | String | Auto-generated (e.g. `PO-1709467200000-A1B2`) |
| `status` | Enum | `WAITING`, `APPROVED`, `REJECTED` |
| `items` | Array | List of line items |
| `items[].itemName` | String | **Required** |
| `items[].quantity` | Number | Default: 1 |
| `items[].description` | String | Optional |
| `items[].unitPrice` | Number | **Required** |
| `totalAmount` | Number | Auto-calculated |
| `purchaseOrderDate` | Date | Auto-set on creation |
| `paymentDate` | Date | Optional, user-provided |
| `branch` | ObjectId → Branch | Populated in responses |
| `supplier` | ObjectId → Supplier | Populated in responses |
| `createdBy` | ObjectId | Creator user |
| `creatorRole` | String | Creator's role |
| `approvedBy` | ObjectId | Approver user (null until actioned) |
| `approverRole` | String | Approver's role |
| `isEdited` | Boolean | `true` if PO has been edited |
| `editHistory` | Array | Log of all edits |
| `createdAt` | Date | Timestamp |
| `updatedAt` | Date | Timestamp |

---

## UI Screen Suggestions

### 1. PO List Page
- Table with columns: PO#, Status (badge), Total, Branch, Supplier, Date, Actions
- Color-code status: `WAITING` → amber, `APPROVED` → green, `REJECTED` → red
- Filter tabs: All / Waiting / Approved / Rejected
- "Create PO" button in top-right

### 2. Create PO Form
- **Items** — dynamic rows: Item Name (text), Quantity (number), Unit Price (number), Description (text), ➕/🗑️ buttons
- **Running total** — live-calculated as items are added/changed
- **Supplier** — searchable dropdown from `/api/supplier`
- **Branch** — hidden for staff (auto-assigned) / dropdown for CountryManager+
- **Payment Date** — date picker (optional)

### 3. PO Detail Page
- Full item table with subtotals
- Status badge with approver info (if actioned)
- Edit History timeline (if `isEdited`)
- **Action buttons** (conditional):
  - "Edit" → only for creator / Admin
  - "Approve" / "Reject" → only if rules above are met
  - Show a clear message if the PO is > $1000: "Requires Admin approval"

### 4. Approve/Reject Modal
- Show PO summary (items, total, creator, branch)
- Two buttons: ✅ Approve / ❌ Reject
- Optional: notes field for rejection reason
