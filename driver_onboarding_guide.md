# Driver Onboarding Integration Guide (Frontend)

This guide outlines the backend workflow for driver onboarding. If you are experiencing bugs or "Gate Validation Failed" errors, check the requirements for each status transition carefully.

## 1. Onboarding Workflow Overview

Drivers progress through a strict linear flow. You **cannot skip stages**.

`DRAFT` → `PENDING REVIEW` → `VERIFICATION` → `CREDIT CHECK` → `APPROVED` → `CONTRACT PENDING` → `ACTIVE`

*   **Branching**: `CREDIT CHECK` may lead to `MANAGER REVIEW` if the score is borderline (500–649).
*   **Terminals**: A driver can be `REJECTED` from most stages or `SUSPENDED` once `ACTIVE`.

---

## 2. Core API Endpoints

### Create Driver (`DRAFT`)
*   **POST** `/api/driver`
*   **Required Payload**: `personalInfo` (fullName, email, phone) and `branch` (ObjectId).
*   **Initial Status**: `DRAFT`.

### Upload Documents
*   **POST** `/api/driver/:id/upload-documents`
*   **Type**: `multipart/form-data`
*   **Field Names** (Must match exactly):
    *   `photograph`, `idFrontImage`, `idBackImage`, `licenseFront`, `licenseBack`, `backgroundCheckDocument`, `addressProofDocument`, `medicalCertificate`, `consentForm`, `contractPDF`, `signedContract`.
*   **Note**: Uploading a document automatically updates the driver's record with the S3 key. Make sure to upload **before** calling the progress API.

### Progress Status (The "Workflow" API)
*   **PUT** `/api/driver/:id/progress`
*   **Payload**:
    ```json
    {
      "targetStatus": "PENDING REVIEW",
      "updateData": { ... }, 
      "notes": "Optional audit note"
    }
    ```
*   **UpdateData Whitelisting**: The backend only accepts specific fields during each transition. Sending extra fields will result in them being stripped.

---

## 3. Transition Requirements (Gates)

If you get a `422 Unprocessable Entity`, it means a "Gate" failed. Here are the rules:

| Target Status | Allowed From | Req. Fields / Prerequisites |
| :--- | :--- | :--- |
| **PENDING REVIEW** | `DRAFT` | `fullName`, `email`, `phone`, `idFrontImage`, `idBackImage`, `licenseFront`, `licenseBack`, `licenseNumber`, `expiryDate`, `emergencyContact` (Name/Phone). |
| **VERIFICATION** | `PENDING REVIEW` | `drivingLicense.verificationStatus` must be set to `VERIFIED` by Staff. AND `backgroundCheckDocument` must be uploaded. |
| **CREDIT CHECK** | `VERIFICATION` | `creditCheck.consentForm` (signed copy) must be uploaded. |
| **APPROVED** | `CREDIT CHECK` / `MANAGER REVIEW` | Credit score must be present. System auto-decides the score; decision cannot be `DECLINED`. |
| **CONTRACT PENDING** | `APPROVED` | `contract.generatedS3Key` must be present. |
| **ACTIVE** | `CONTRACT PENDING` | `contract.signedS3Key` (signed copy) must be uploaded. |

---

## 4. Common "Bugs" & Solutions

### "Missing required fields" Error
*   **Cause**: You called `/progress` to `PENDING REVIEW` before the driver had all documents uploaded or personal info filled.
*   **Fix**: Ensure the driver object has all ID and License images uploaded via `/upload-documents` **before** progressing to `PENDING REVIEW`.

### "Role not authorized" Error
*   **Cause**: The logged-in user doesn't have the permission to move the driver to the next stage.
*   **Policy**:
    *   `FINANCESTAFF`: Can progress to `PENDING REVIEW`, `VERIFICATION`, `CREDIT CHECK`, `CONTRACT PENDING`.
    *   `BRANCHMANAGER`: Required for `APPROVED`, `ACTIVE`, `SUSPENDED`, and `REJECTED`.

### Documents not showing up after upload
*   **Cause**: Mismatched field names in `multipart/form-data`.
*   **Fix**: Check `S3_FIELD_MAP` in `DriverController.js`. For example, use `licenseFront` (not `license_front`).

### Credit Check Issues
*   **Note**: The system automatically generates a score and decision when you progress to `CREDIT CHECK`. You don't need to send the score yourself. If the score is between 500-649, it will stay in `MANAGER REVIEW` until a Manager approves it.

---

## 5. Summary Table of S3 Fields (For Upload)
| Frontend Field | DB Path |
| :--- | :--- |
| `photograph` | `personalInfo.photograph` |
| `idFrontImage` | `identityDocs.idFrontImage` |
| `licenseFront` | `drivingLicense.frontImage` |
| `backgroundCheckDocument` | `backgroundCheck.document` |
| `consentForm` | `creditCheck.consentForm` |
| `signedContract` | `contract.signedS3Key` |
