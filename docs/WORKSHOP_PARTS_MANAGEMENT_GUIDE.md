# Workshop Parts and Stock Management Guide

This document provides a detailed overview of the Parts Inventory and Stock Management system implemented for the OlaCars Workshop module.

---

## 1. Overview

The system bridges the gap between the physical inventory and active vehicle repairs (Work Orders). It ensures that parts are correctly allocated, tracked, and audited throughout their entire lifecycle—from the shelf to the car.

> [!IMPORTANT]
> **Key Goal**: Provide real-time accurate stock levels (`onHand` vs `reserved`) to prevent over-allocation and provide a full audit trail of part movements.

---

## 2. Core Concepts

### 2.1 Stock Level Types
Each part in the inventory tracks three essential quantities:

| Metric | Description |
| :--- | :--- |
| **Quantity On Hand** | Total physical units currently in the building. |
| **Quantity Reserved** | Units allocated to active Work Orders (not yet installed). |
| **Quantity Available** | Calculated as: `onHand - reserved`. Safe to promise to new repairs. |

### 2.2 Reorder Levels
Each part has a `reorderLevel`. When `onHand` drops to or below this level, the part is marked as **Low Stock**, triggering recruitment/procurement alerts.

---

## 3. Part Lifecycle in a Work Order

A part follows a controlled state machine within a Work Order, synchronized with the global inventory.

### 🟢 Status: REQUESTED
- **Meaning**: The part is listed on the repair task but has not been pulled from stock (or it's currently out of stock).
- **Inventory Action**: None.

### 🟡 Status: RESERVED
- **Meaning**: Stock is available and has been "earmarked" for this specific vehicle.
- **Inventory Action**: `quantityReserved` increases by 1. 
- **Stock Change**: Physical `onHand` remains the same, but `available` decreases.

### 🔴 Status: INSTALLED
- **Meaning**: The technician has physically fitted the part to the vehicle.
- **Inventory Action**: Both `quantityOnHand` and `quantityReserved` decrease by 1.
- **Stock Change**: The part has physically left the inventory.

### 🔵 Status: RETURNED
- **Meaning**: The part was previously installed but then removed (e.g., wrong fitment).
- **Inventory Action**: `quantityOnHand` increases by 1.
- **Stock Change**: The part is back in stock and immediately available for other vehicles.

---

## 4. Part Transaction Audit Trail

Every movement—whether it's a reservation for a work order, an installation, or a restock from a supplier—is recorded in the **PartTransaction** model.

### Every transaction captures:
- **Part ID**: Which part was moved.
- **Branch ID**: Where it occurred.
- **Work Order ID**: The specific repair linked to the movement.
- **Type**: `RESERVE`, `RELEASE`, `INSTALL`, `RETURN`, `RESTOCK`, or `ADJUSTMENT`.
- **User Info**: Both the specific user ID and their role (e.g., Workshop Staff).

---

## 5. Key API Endpoints

### 5.1 Workshop Dashboard
Returns all pending part requirements for a specific branch (parts currently in `REQUESTED` or `RESERVED` status).
- **GET** `/api/inventory/workshop-requirements/:branchId`

### 5.2 Part Audit Trail
Fetch the complete history for a specific part.
- **GET** `/api/inventory/:id/transactions`

### 5.3 Low Stock Monitoring
List all parts for a branch that need urgent reordering.
- **GET** `/api/inventory/low-stock/:branchId`

---

## 6. Best Practices for Workshop Staff

1. **Reserve Early**: Move parts to `RESERVED` as soon as the repair plan is approved to ensure no other tech takes the last unit.
2. **Confirm Installation**: Once the physical job is done, mark the part as `INSTALLED` immediately to keep financial reporting accurate.
3. **Use the "Workshop Requirements" View**: Start every morning by checking the requirements list to see which cars are waiting on parts.

---

*Last Updated: April 2026*
