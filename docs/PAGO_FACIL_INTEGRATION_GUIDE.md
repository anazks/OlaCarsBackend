# Pago Fácil / Western Union Integration Guide

## Overview
This API allows Pago Fácil to query for a matching Driver and check their total pending Rent (Debt). The driver can then pay the exact, or a partial amount via CashIn, which triggers a notification. All transactions can securely be reversed in real-time.

## API Specification

**Base URL**: `POST /pagofacil/api`
**Content-Type**: `application/json`

### Authentication
Two modes are supported:
1. **Bearer Token** (Preferred)
   * `Authorization: Bearer <token>`
   * Request an OAuth 2 token using the standard `/pagofacil/api/auth/token` endpoint.
2. **Basic JSON Auth** (Fallback)
   * Adding `"user": "pagofacil", "password": "..."` to the root JSON object of every request.

---

### 1. CONSULTA API Action (Fetch Driver Debt)
Endpoint: `POST /pagofacil/api/consulta`

**Function**: Looks up the driver dynamically.
* `campos_busqueda[0].campo1` checks the following sequentially:
   1. `Driver.identityDocs.idNumber` (DNI)
   2. `Driver.personalInfo.phone` (Phone Number)
   3. `Driver._id` (Internal Object ID)

**Response `importe`**: Represents the total outstanding balance from `rentTracking`. Sent as a combined integer string where the **last 2 digits represent decimals**. Example: ₹150.00 is returned as `"15000"`.

---

### 2. DIRECTA API Action (Notification of Payment)
Endpoint: `POST /pagofacil/api/directa`

**Function**: Deducts the received `importe` from the Driver's outstanding rent sequentially using a FIFO application logic (clearing oldest debts completely before applying residuals to the next week).

**Idempotency**: Strictly maintained using the `cod_trx` field securely anchored to `PaymentTransactionModel`. Replaying identical `cod_trx` triggers a `Success 0` response.

---

### 3. REVERSA API Action (Reversal of Payment)
Endpoint: `POST /pagofacil/api/reversa`

**Function**: Targets the specific `cod_trx`. If the initial notification allocated the payment across 3 separate weeks, the system recalculates those 3 individual weeks exactly.

**Safety**: Returning `Already Reversed [0]` if already processed protects the underlying data against multiple deductions.

---

### End-To-End Testing Notes
* Always use `id_item` returned from the Consulta payload within Directa.
* Do not rely solely upon error codes: logging has been added sequentially directly below every Request / internal check sequence.
