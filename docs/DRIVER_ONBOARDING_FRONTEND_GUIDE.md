# Driver Onboarding — Frontend Developer Guide

**API Base:** `{{BASE_URL}}/api/driver`
**Auth:** All endpoints require `Authorization: Bearer <accessToken>` header.
**Date:** March 3, 2026

---

## Onboarding Flow Overview

```
DRAFT → PENDING REVIEW → VERIFICATION → CREDIT CHECK → APPROVED → CONTRACT PENDING → ACTIVE
                                              ↓
                                        MANAGER REVIEW → APPROVED / REJECTED
```

A driver can also be **REJECTED** from PENDING REVIEW, VERIFICATION, CREDIT CHECK, or MANAGER REVIEW.
An **ACTIVE** driver can be **SUSPENDED** and later **reactivated**.

---

## API Endpoints Quick Reference

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `POST` | `/api/driver` | Create new driver application |
| `GET` | `/api/driver` | List all drivers (supports `?status=` & `?branch=` filters) |
| `GET` | `/api/driver/:id` | Get full driver profile |
| `PUT` | `/api/driver/:id` | Edit driver fields (personal info, docs, etc.) |
| `PUT` | `/api/driver/:id/progress` | **Workflow transition** — move to next status |
| `POST` | `/api/driver/:id/upload-documents` | Upload files to S3 (multipart/form-data) |
| `DELETE` | `/api/driver/:id` | Soft-delete a driver |

---

## Stage-by-Stage Breakdown

---

### Stage 1: DRAFT

> *"Finance Staff creates the driver profile and begins entering information."*

**Who:** Finance Staff / Branch Manager
**UI:** A multi-section form to capture the driver's basic info.

**API Call — Create Driver:**
```
POST /api/driver
Content-Type: application/json

{
  "branch": "{{branchObjectId}}",
  "personalInfo": {
    "fullName": "John Doe",           // required
    "dateOfBirth": "1990-05-15",
    "nationality": "Kenyan",
    "email": "john@example.com",       // required
    "phone": "+254712345678",          // required
    "whatsappNumber": "+254712345678"
  },
  "identityDocs": {
    "idType": "National ID",           // enum: "National ID" | "Passport"
    "idNumber": "12345678"
  },
  "emergencyContact": {
    "name": "Jane Doe",               // required for next stage
    "relationship": "Spouse",
    "phone": "+254700000000"           // required for next stage
  }
}
```

**Response:** Driver object with `status: "DRAFT"`

**UI Notes:**
- Show a progress tracker at the top (Step 1 of 7)
- All fields can be saved partially — the record stays in DRAFT until explicitly submitted
- The staff can come back and edit via `PUT /api/driver/:id` at any time while in DRAFT

---

### Uploading Documents (applies across all stages)

Before moving from DRAFT → PENDING REVIEW, the finance staff needs to upload identity & license images.

**API Call — Upload Documents:**
```
POST /api/driver/:id/upload-documents
Content-Type: multipart/form-data

Fields (pick any combination):
  photograph          → Driver's photo
  idFrontImage        → National ID / Passport front
  idBackImage         → National ID / Passport back
  licenseFront        → Driving license front
  licenseBack         → Driving license back
  backgroundCheckDocument → Criminal record certificate
  addressProofDocument    → Utility bill / bank statement
  medicalCertificate      → Medical fitness certificate (if required)
  consentForm             → Signed Experian credit check consent
  contractPDF             → System-generated contract
  signedContract          → Signed contract copy
```

**Response:**
```json
{
  "success": true,
  "message": "Documents uploaded and driver record updated.",
  "data": {
    "idFrontImage": "drivers/6xxx/documents/idFrontImage_17xxx_scan.jpg",
    "idBackImage": "drivers/6xxx/documents/idBackImage_17xxx_scan.jpg"
  }
}
```

> **Note:** The S3 upload endpoint **automatically updates the driver record** with the S3 keys. You do NOT need to call `PUT /api/driver/:id` separately after uploading — the DB is updated for you.

**UI Notes:**
- Show upload progress indicators
- Accept images (JPEG, PNG) and PDFs
- Max file size: 5 MB per file
- Show thumbnail previews after upload

---

### Stage 2: PENDING REVIEW

> *"All required documents are uploaded — finance staff submits the application for review."*

**Who:** Finance Staff
**Prerequisite:** These fields must be populated before this transition will succeed:
- `personalInfo.fullName`, `.email`, `.phone`
- `identityDocs.idFrontImage`, `.idBackImage`
- `drivingLicense.licenseNumber`, `.frontImage`, `.backImage`, `.expiryDate`
- `emergencyContact.name`, `.phone`

**API Call — Progress:**
```
PUT /api/driver/:id/progress
Content-Type: application/json

{
  "targetStatus": "PENDING REVIEW",
  "notes": "All documents collected and uploaded."
}
```

**Error if prerequisites missing:**
```json
{
  "success": false,
  "message": "Gate validation failed: Missing required fields: identityDocs.idFrontImage, drivingLicense.licenseNumber"
}
```

**UI Notes:**
- Show a document checklist with green ✓ / red ✗ indicators
- Disable the "Submit for Review" button until all required fields are filled
- You can pre-validate on the frontend by checking the driver object's fields

---

### Stage 3: VERIFICATION

> *"Finance Staff verifies the driving license and reviews the background check."*

**Who:** Finance Staff
**Prerequisites:**
- Driving license `verificationStatus` must be `"VERIFIED"`
- Background check document must be uploaded

**Step 1 — Verify driving license** (update the driver record):
```
PUT /api/driver/:id

{
  "drivingLicense": {
    "verificationStatus": "VERIFIED",
    "verifiedDate": "2026-03-03"
  }
}
```

**Step 2 — Upload background check** (if not already uploaded):
```
POST /api/driver/:id/upload-documents  → backgroundCheckDocument
```
Then update:
```
PUT /api/driver/:id

{
  "backgroundCheck": {
    "document": "drivers/6xxx/documents/backgroundCheck_17xxx.pdf",
    "status": "UPLOADED",
    "issuedDate": "2026-02-20"
  }
}
```

**Step 3 — Progress:**
```
PUT /api/driver/:id/progress

{
  "targetStatus": "VERIFICATION",
  "notes": "License verified via transport authority portal. Background check uploaded."
}
```

**UI Notes:**
- Show a verification panel with:
  - License details (number, country, expiry) with a "Mark as Verified" / "Mark as Failed" toggle
  - Background check document viewer with "Cleared" / "Not Cleared" toggle
- If license verification fails, the BM can REJECT the application

---

### Stage 4: CREDIT CHECK

> *"Finance Staff initiates the Experian credit check."*

**Who:** Finance Staff
**Prerequisite:** Signed credit check consent form must be uploaded.

**Step 1 — Upload consent form** (if not already done):
```
POST /api/driver/:id/upload-documents  → consentForm
```
> The driver record is auto-updated with the S3 key — no separate PUT needed.

**Step 2 — Progress to CREDIT CHECK and record score:**
```
PUT /api/driver/:id/progress

{
  "targetStatus": "CREDIT CHECK",
  "updateData": {
    "creditCheck": {
      "score": 720
    }
  },
  "notes": "Experian credit check completed."
}
```

The system **automatically evaluates** the score and sets:
- `rating`: EXCELLENT / GOOD / FAIR / POOR / VERY POOR / **FRAUD**
- `decision`: AUTO_APPROVED / MANUAL_REVIEW / DECLINED

> **⚠️ Important:** The `rating` and `decision` are **always set by the server** — you cannot override them from the frontend. The system auto-decides based on the score.

**Score Brackets:**
| Score | Rating | Decision | What Happens |
|-------|--------|----------|-------------|
| 750–850 | EXCELLENT | AUTO_APPROVED | Can go directly to APPROVED |
| 650–749 | GOOD | AUTO_APPROVED | Can go directly to APPROVED |
| 500–649 | FAIR | MANUAL_REVIEW | Must go to MANAGER REVIEW |
| 350–499 | POOR | DECLINED | Should go to REJECTED |
| < 350 | VERY POOR | DECLINED | Should go to REJECTED |
| Any (fraud flagged) | **FRAUD** | **DECLINED** | **Auto-rejected immediately** |

**🚨 Fraud Alert Handling:**
If Experian returns a fraud alert, send `fraudAlert: true` in the credit check payload:
```json
{
  "targetStatus": "CREDIT CHECK",
  "updateData": {
    "creditCheck": {
      "score": 650,
      "fraudAlert": true
    }
  }
}
```
The system will **automatically reject** the application — status goes straight to `REJECTED` with reason `"FRAUD ALERT"`. No manual override is possible.

**UI Notes:**
- Show a "Run Credit Check" button
- After result, display the score with a color-coded badge (green/yellow/red)
- If `MANUAL_REVIEW`: show a banner "Branch Manager review required"
- If `DECLINED`: show a red alert and offer a "Reject Application" button
- If `FRAUD`: show a **red danger alert** "Fraud Detected — Application Auto-Rejected"

---

### Stage 5a: MANAGER REVIEW (borderline cases only)

> *"Branch Manager reviews borderline credit scores (500–649)."*

**Who:** Branch Manager
**When:** Only when `creditCheck.decision === "MANUAL_REVIEW"`

**API Call — Progress to MANAGER REVIEW:**
```
PUT /api/driver/:id/progress

{
  "targetStatus": "MANAGER REVIEW",
  "notes": "Borderline credit score flagged for BM review."
}
```

Then the Branch Manager reviews and either **approves** or **rejects**:

**Approve:**
```
PUT /api/driver/:id/progress

{
  "targetStatus": "APPROVED",
  "updateData": {
    "creditCheck": {
      "reviewNotes": "Score is borderline but driver has strong references and stable employment."
    }
  },
  "notes": "Approved with conditions after BM review."
}
```

**Reject:**
```
PUT /api/driver/:id/progress

{
  "targetStatus": "REJECTED",
  "updateData": {
    "rejection": {
      "reason": "CREDIT DECLINED",
      "notes": "Score too low and no supporting evidence provided."
    }
  }
}
```

**UI Notes:**
- Show the full credit report details
- Provide a text area for review notes
- Two action buttons: "Approve" (green) and "Reject" (red)
- This page is only visible to Branch Manager role

---

### Stage 5b: APPROVED

> *"Credit check is cleared — driver is approved for contract."*

**Who:** Finance Staff (auto-approved) / Branch Manager (after review)

**API Call (if auto-approved, skip MANAGER REVIEW):**
```
PUT /api/driver/:id/progress

{
  "targetStatus": "APPROVED",
  "notes": "Auto-approved with credit score 720."
}
```

**UI Notes:**
- Show a success banner: "Driver Approved — Ready for Contract"
- Enable the "Generate Contract" action

---

### Stage 6: CONTRACT PENDING

> *"Contract is generated and sent to the driver for signature."*

**Who:** Finance Staff
**Prerequisite:** Contract PDF must be uploaded (generated or manually created).

**Step 1 — Upload contract PDF:**
```
POST /api/driver/:id/upload-documents  → contractPDF
```
> The driver record is auto-updated with the S3 key — no separate PUT needed.

**Step 2 — Progress:**
```
PUT /api/driver/:id/progress

{
  "targetStatus": "CONTRACT PENDING",
  "notes": "Contract generated and sent to driver."
}
```

The system automatically records `contract.issuedDate`.

**After driver signs:** Upload the signed copy and save:
```
POST /api/driver/:id/upload-documents  → signedContract
```
```
PUT /api/driver/:id

{
  "contract": {
    "signedS3Key": "drivers/6xxx/documents/signedContract_17xxx.pdf",
    "signedDate": "2026-03-05"
  }
}
```

**UI Notes:**
- Show contract preview / download link
- Show "Awaiting Signature" badge
- Upload area for signed contract
- "Contract Signed" checkbox / button

---

### Stage 7: ACTIVE

> *"Branch Manager activates the driver account."*

**Who:** Branch Manager
**Prerequisite:** Signed contract must be uploaded.

**API Call:**
```
PUT /api/driver/:id/progress

{
  "targetStatus": "ACTIVE",
  "updateData": {
    "activation": {
      "credentialsSent": true,
      "gpsMonitoringActive": true
    }
  },
  "notes": "Driver account activated. Welcome email sent."
}
```

The system automatically records `activation.activatedDate`.

**UI Notes:**
- Show a final activation checklist:
  - ✓ Contract signed
  - ✓ Login credentials sent
  - ✓ GPS monitoring activated
- Big green "Activate Driver" button (Branch Manager only)
- After activation, driver appears on the fleet dashboard

---

### SUSPENDED (post-onboarding)

> *"Driver temporarily disabled due to policy breach, document expiry, etc."*

**Who:** Branch Manager

**Suspend:**
```
PUT /api/driver/:id/progress

{
  "targetStatus": "SUSPENDED",
  "updateData": {
    "suspension": {
      "reason": "DOCUMENT EXPIRY",
      "notes": "Driving license expired on 2026-02-28."
    }
  }
}
```

Reason must be one of: `DOCUMENT EXPIRY` | `GPS SCORE BREACH` | `POLICY VIOLATION` | `MANAGER ACTION` | `OTHER`

**Reactivate:**
```
PUT /api/driver/:id/progress

{
  "targetStatus": "ACTIVE",
  "notes": "License renewed. Document updated in system."
}
```

---

### REJECTED (dead-end)

> *"Application declined."*

**Who:** Branch Manager

**API Call:**
```
PUT /api/driver/:id/progress

{
  "targetStatus": "REJECTED",
  "updateData": {
    "rejection": {
      "reason": "CREDIT DECLINED",
      "notes": "Credit score 420 — below minimum threshold."
    }
  }
}
```

Reason must be one of: `CREDIT DECLINED` | `FRAUD ALERT` | `DOCUMENT FRAUD` | `FAILED VERIFICATION` | `OTHER`

---

## Listing & Filtering

**List all drivers:**
```
GET /api/driver
```

**Filter by status:**
```
GET /api/driver?status=DRAFT
GET /api/driver?status=ACTIVE
```

**Filter by branch:**
```
GET /api/driver?branch={{branchObjectId}}
```

**Combine filters:**
```
GET /api/driver?status=PENDING REVIEW&branch={{branchObjectId}}
```

> **🔒 Sensitive Field Restriction:** The `bankDetails` and `creditCheck.reportS3Key` fields are **hidden by default** in GET responses. Only users with **FINANCESTAFF**, **FINANCEADMIN**, or **ADMIN** roles will see these fields. If your frontend needs to show bank details, the logged-in user must have a finance role — otherwise those fields will be absent from the response.

**UI Notes:**
- Build a dashboard table with columns: Name, Status, Branch, Created, Last Updated
- Color-code status badges:
  - 🔵 DRAFT, PENDING REVIEW
  - 🟡 VERIFICATION, CREDIT CHECK, MANAGER REVIEW
  - 🟢 APPROVED, CONTRACT PENDING, ACTIVE
  - 🔴 REJECTED, SUSPENDED
- Add a filter bar with status dropdown and branch selector
- Clicking a row opens the driver detail page
- **Bank details section:** Only render if `data.bankDetails` exists in the response (finance roles only)

---

## Error Handling

All error responses follow:
```json
{
  "success": false,
  "message": "Descriptive error message"
}
```

| HTTP Code | Meaning |
|-----------|---------|
| 400 | Invalid status or bad request |
| 403 | Role not authorized for this action |
| 404 | Driver not found |
| 422 | Gate validation failed — prerequisites missing |
| 500 | Server error |

---

## Role Permissions Summary

| Action | Finance Staff | Branch Manager | Country Manager | Admin |
|--------|:---:|:---:|:---:|:---:|
| Create driver | ✅ | ✅ | — | — |
| Edit driver fields | ✅ | ✅ | — | — |
| Upload documents | ✅ | ✅ | — | — |
| Progress workflow | ✅ | ✅ | ✅ | ✅ |
| Approve (APPROVED) | — | ✅ | ✅ | ✅ |
| Reject | — | ✅ | ✅ | ✅ |
| Activate | — | ✅ | ✅ | ✅ |
| Suspend / Reactivate | — | ✅ | ✅ | ✅ |
| Delete | — | ✅ | — | ✅ |
| List / View | ✅ | ✅ | ✅ | ✅ |
