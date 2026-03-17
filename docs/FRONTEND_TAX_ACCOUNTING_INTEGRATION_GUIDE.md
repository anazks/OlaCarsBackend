# Tax & Accounting — Frontend Integration Guide

This guide covers the **Tax Management**, **Chart of Accounts (Accounting Codes)**, and **General Ledger** modules. These are the financial backbones of the OlaCars system.

---

## 🔑 1. Role-Based Access

Financial screens are highly sensitive. Access should be restricted based on `req.user.role`:

- **ADMIN**: Full access to all settings and ledger views.
- **FINANCEADMIN**: Full access to setup taxes, accounting codes, and view ledgers.
- **FINANCESTAFF**: Usually can view ledgers and codes but cannot change Tax rates or delete accounts.

---

## 📂 2. Page-by-Page Breakdown

### Page 1: Tax Management
**What is it for?** Setting up tax profiles (e.g., VAT 15%, Service Tax 5%).
- **What to do:**
    - List all tax profiles in a table.
    - Form to "Add New Tax": Requires `name` and `rate` (percentage).
    - Toggle for `isActive`: To enable/disable a tax rate without deleting it.
- **APIs to use:**
    - `GET /api/tax` (List)
    - `POST /api/tax` (Create)
    - `PUT /api/tax/:id` (Update/Toggle)

---

### Page 2: Chart of Accounts (Accounting Codes)
**What is it for?** Defining the "buckets" where money goes (Income, Expenses, Assets).
- **What to do:**
    - List codes like `4000 (Rental Income)`, `5000 (Maintenance Expense)`.
    - Filter by **Category**: `INCOME`, `EXPENSE`, `LIABILITY`, `ASSET`, `EQUITY`.
    - Form to "Add Accounting Code": Requires `code`, `name`, and `category`.
- **APIs to use:**
    - `GET /api/accounting-code`
    - `POST /api/accounting-code`

---

### Page 3: General Ledger (Read-Only)
**What is it for?** A master list of every financial transaction (Audit Trail).
- **What to do:**
    - A read-only table showing: `Date`, `Description`, `Accounting Code`, `Debit`, `Credit`.
    - **Logic:** In accounting, every entry is either a DEBIT or a CREDIT.
    - **Pro-tip:** Add a Date Range Picker and a filter for Accounting Codes.
- **APIs to use:**
    - `GET /api/ledger`

---

### Page 4: Finance Dashboard
**What is it for?** Quick view of financial health.
- **What to show:**
    - Recent transactions (from Ledger).
    - Status of active Service Bills (see Workshop Guide).
- **APIs to use:**
    - `GET /api/ledger` (Sort by newest)

---

## 🛠 3. Important Logic for Beginners

### A. Immutable Ledger
The Ledger is **Read-Only** for the frontend. You cannot `POST`, `PUT`, or `DELETE` ledger entries directly. They are created automatically by the backend when a Payment is made or a Service Bill is finalized.

### B. Tax Rates as Percentages
When the user enters `15`, they mean 15%.
Ensure your frontend validation handles this (don't send `0.15` if the backend expects `15`).

### C. Category Colors
To make the Chart of Accounts easier to read, use different colors for categories:
- **INCOME**: Green
- **EXPENSE**: Red
- **ASSET**: Blue
- **LIABILITY**: Orange

---

## 🔗 4. Reference
- **Workshop Guide:** [FRONTEND_WORKSHOP_INTEGRATION_GUIDE.md](./FRONTEND_WORKSHOP_INTEGRATION_GUIDE.md)
- **API Reference:** (Contact Backend team for Swagger/Postman)

Happy Coding! 🏦
