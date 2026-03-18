# Payment & Purchase Bill — Frontend Developer Guide
 
 ## Overview
 
 In the OlaCars system, a **"Purchase Bill"** is essentially the act of registering a **Payment Transaction** against an approved **Purchase Order**.
 
 The `Payment` module handles this. When a Purchase Order (PO) is approved and the supplier sends a bill, you create an `EXPENSE` transaction in the Payment module referencing that specific PO. When the payment is marked as `COMPLETED`, the backend automatically generates a double-entry ledger record.
 
 ---
 
 ## API Endpoints
 
 **Base URL:** `/api/payment`
 
 | Method | Endpoint | Description |
 |--------|----------|-------------|
 | `POST` | `/` | Create a new Payment Transaction (Register a Purchase Bill) |
 | `GET` | `/` | List all Payment Transactions (Filterable by status/type) |
 | `GET` | `/:id` | Get specific Payment details |
 | `PUT` | `/:id/status` | Update status (e.g., `PENDING` → `COMPLETED`) |
 
 **Auth:** All endpoints require the `Authorization: Bearer <token>` header.
 
 ---
 
 ## 1. Create a Purchase Bill (Payment Transaction)
 
 ```http
 POST /api/payment
 ```
 
 This is used when the user is looking at an approved Purchase Order and clicks "Create Bill" or "Pay Bill". 
 
 ### Important Payload Rules:
 - **`referenceModel`** must be strictly set to `"PurchaseOrder"`.
 - **`referenceId`** must be the exact `_id` of the Purchase Order.
 - **`transactionCategory`** must be `"EXPENSE"`.
 - **`transactionType`** must be `"DEBIT"` (because money is leaving the company).
  
### ⚠️ Backend Constraints:
1. **Approval Required:** You can **only** create a bill for a Purchase Order that is in the `APPROVED` status.
2. **Duplicate Prevention:** The system enforces a **1:1 relationship**. The backend checks the `isBilled` flag on the Purchase Order. If it's already `true`, the request will fail with a `400 Bad Request`.
3. **Automatic Flagging:** Upon successful bill creation, the backend automatically sets the Purchase Order's `isBilled` flag to `true`.

---

## 2. API: Get Eligible Purchase Orders for Billing
Before creating a bill, you should fetch the list of POs that are ready to be billed.

```http
GET /api/purchase-order/eligible-for-billing
```

**What this returns:**
- Only POs with `status: "APPROVED"`.
- Only POs where `isBilled: false`.
- **Automatic Country Filtering:** The API automatically detects the user's country (from their profile or branch) and only returns POs belonging to branches in that same country.

**Why use this?**
Use this to populate your "Select Purchase Order" dropdown in the "Create Bill" form. It ensures the user only sees valid, unbilled POs that they are authorized to handle.
 
 ### Tax Calculation Behavior:
 You have two ways of sending the amounts:
 1. **Tax Inclusive (`isTaxInclusive: true`):** You send the grand `totalAmount`. The backend will automatically calculate the `baseAmount` and `taxAmount` backward based on the `taxApplied` rate.
 2. **Tax Exclusive (`isTaxInclusive: false`):** You send the `baseAmount`. The backend will automatically calculate the `taxAmount` and append it to find the grand `totalAmount`.
 
 ### Example Request Body (Tax Exclusive)
 ```json
 {
   "accountingCode": "65f1a2b3c4d5e6f7a8b9c0d1", // ID of the GL account (e.g., Accounts Payable)
   "referenceId": "65f1a2b3c4d5e6f7a8b9c0d2",  // ID of the Purchase Order
   "referenceModel": "PurchaseOrder",
   "transactionCategory": "EXPENSE",
   "transactionType": "DEBIT",
   "paymentMethod": "BANK_TRANSFER",         // CASH, BANK_TRANSFER, CREDIT_CARD, CHEQUE, OTHER
   "isTaxInclusive": false,
   "baseAmount": 500.00,                      // Before tax
   "taxApplied": "65f1a2b3c4d5e6f7a8b9c0d3",  // ID of the applicable Tax rule (optional)
   "status": "COMPLETED",                     // PENDING, COMPLETED, FAILED, CANCELLED
   "notes": "Payment for Supplier Invoice #INV-8892"
 }
 ```
 
 ### Example Request Body (Tax Inclusive)
 ```json
 {
   "accountingCode": "65f1a2b3c4d5e6f7a8b9c0d1",
   "referenceId": "65f1a2b3c4d5e6f7a8b9c0d2",
   "referenceModel": "PurchaseOrder",
   "transactionCategory": "EXPENSE",
   "transactionType": "DEBIT",
   "paymentMethod": "CHEQUE",
   "isTaxInclusive": true,
   "totalAmount": 525.00,                     // Grand total including tax
   "taxApplied": "65f1a2b3c4d5e6f7a8b9c0d3",
   "status": "PENDING",
   "notes": "First half of the PO payment"
 }
 ```
 
 ### Response (201)
 ```json
 {
   "success": true,
   "data": {
     "_id": "...",
     "referenceId": "...",
     "referenceModel": "PurchaseOrder",
     "transactionCategory": "EXPENSE",
     "transactionType": "DEBIT",
     "baseAmount": 500,
     "taxAmount": 25,
     "totalAmount": 525,
     "paymentMethod": "CHEQUE",
     "status": "PENDING",
     ...
   }
 }
 ```
 
 ---
 
 ## 2. Update Payment Status (Triggering the Ledger)
 
 ```http
 PUT /api/payment/:id/status
 ```
 
 If a purchase bill is created with a `PENDING` status (e.g., a cheque was written but hasn't cleared), a finance manager will later update it to `COMPLETED`.
 
 **⚠️ CRITICAL BACKEND BEHAVIOR:** 
 Changing the status to `"COMPLETED"` strictly triggers the `autoGenerateLedgerEntry()` background service. Once a payment is `COMPLETED`, **the status cannot be changed** because it is already locked into the financial ledger.
 
 ### Request Body
 ```json
 {
   "status": "COMPLETED"
 }
 ```
 
 ---
 
 ## 3. List Purchase Bills (Payments)
 
 ```http
 GET /api/payment?status=COMPLETED&transactionCategory=EXPENSE&transactionType=DEBIT
 ```
 
 You can filter the payments list using query parameters:
 - `?status=PENDING`
 - `?transactionCategory=EXPENSE`
 - `?transactionType=DEBIT`
 
 ---
 
 ## UI Screen Suggestions
 
 ### 1. "Pay Bill" Modal (from the Purchase Order View)
 - When viewing an `APPROVED` Purchase Order, show a "Register Bill / Pay" button.
 - Open a modal with:
   - **Amount Input:** Let the user type the amount (support partial payments if needed, though PO total is standard).
   - **Tax Toggle:** A checkbox for "Tax Inclusive".
   - **Tax Dropdown:** Select from `/api/tax` profiles.
   - **Payment Method Dropdown:** Bank Transfer, Cheque, Cash, etc.
   - **Accounting Code Dropdown:** Fetch from `/api/accounting-code` (filtered for Expense accounts).
   - **Status Dropdown:** `PENDING` or `COMPLETED`.
 
 ### 2. Purchase Bills / Payments Dashboard
 - A table view hitting `GET /api/payment?transactionCategory=EXPENSE`.
 - Show columns: Date, Amount, Tax, Method, Status, and a link to the original Purchase Order (`referenceId`).
 - Status badges: `PENDING` (yellow), `COMPLETED` (green), `FAILED` (red).
 - For `PENDING` rows, provide an action button to "Mark as Completed".
