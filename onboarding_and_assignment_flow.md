# Frontend Onboarding & Assignment Implementation Guide

This guide breaks down the driver onboarding and vehicle assignment process into functional pages for the frontend.

## Page 1: Driver Registration (`DRAFT`)
- **Objective**: Collect basic driver information to start the application.
- **Action**: Call `POST /api/driver`
- **Fields required**:
  - `personalInfo.fullName`
  - `personalInfo.email`
  - `personalInfo.phone`
  - `branch` (The Branch ObjectId)
- **Result**: You'll receive a `driverId`. Save this for subsequent requests.

## Page 2: Document Upload & Detailed Entry
- **Objective**: Upload all required ID and License documents.
- **Action 1**: Call `POST /api/driver/:id/upload-documents` (once for each file or altogether).
- **Multipart Fields**: `photograph`, `idFrontImage`, `idBackImage`, `licenseFront`, `licenseBack`, `backgroundCheckDocument`.
- **Action 2**: Save additional driver data using `PUT /api/driver/:id/progress`.
  - Pass `targetStatus: "PENDING REVIEW"`.
  - Include data like `drivingLicense.licenseNumber` and `drivingLevel.expiryDate`.

> [!IMPORTANT]
> **Wait for all uploads to finish before progressing.** The status change WILL fail if documents are missing from the DB.

## Page 3: Staff Verification (Review)
- **Objective**: Internal staff (Finance/Operation) verifies the driver's info.
- **Action**: Call `PUT /api/driver/:id/progress` with `targetStatus: "VERIFICATION"`.
- **Pre-requisite**: Staff must first set `drivingLicense.verificationStatus` to `VERIFIED` and ensure `backgroundCheckDocument` exists.

## Page 4: Credit Check & Approval
- **Objective**: Perform the credit score assessment.
- **Action**: Call `PUT /api/driver/:id/progress` with `targetStatus: "CREDIT CHECK"`.
- **System Behavior**: The backend automatically generates a score. If the score is < 500, status becomes `REJECTED`. If 500-649, status becomes `MANAGER REVIEW`. If 650+, status becomes `APPROVED`.

## Page 5: Contract Generation & Signing
- **Objective**: Finalize the legal agreement using dynamic templates.
- **Step 1: Fetch the Template**: Call `GET /api/agreements?type=DRIVER_AGREEMENT` to find the correct template ID for the driver's country.
- **Step 2: Render with Data**: Call `GET /api/agreements/:templateId/render`. This replaces tags like `{{DRIVER_NAME}}` with real data from the driver's profile.
- **Step 3: Generate & Upload PDF**:
    - Convert the rendered HTML to a PDF (either via a frontend library or a separate microservice).
    - Upload the PDF to `POST /api/driver/:id/upload-documents` using field name `contractPDF`.
    - *This sets `contract.generatedS3Key` which is required for the next step.*
- **Step 4: Issue Contract**: Call `PUT /api/driver/:id/progress` with `targetStatus: "CONTRACT PENDING"`.
- **Step 5: Signing**: Once the driver signs, upload the signed copy via `POST /api/driver/:id/upload-documents` using field `signedContract`.
- **Step 6: Activate**: Call `PUT /api/driver/:id/progress` with `targetStatus: "ACTIVE"`.

## Page 6: Vehicle Selection & Assignment
- **Objective**: Assign an available car and generate a specific Assignment Agreement.
- **Step 1: List Available Cars**: Fetch available cars via `GET /api/vehicle/available`.
- **Step 2: Agreement Template**: Call `GET /api/agreements?type=VEHICLE_ASSIGNMENT_AGREEMENT` to find the assignment template.
- **Step 3: Render Contract**: Call `GET /api/agreements/:templateId/render`.
    - *Note*: This will include `VEHICLE_*` and `LEASE_*` tags replaced with the selected car and lease data.
- **Step 4: Upload Assignment PDF**:
    - Generate PDF from the rendered HTML.
    - Upload to `POST /api/driver/:id/upload-documents` with field name `contractPDF` (or send directly in the assign API if preferred, but usually uploaded first).
- **Step 5: Confirm Assignment**: Call `POST /api/vehicle/:id/assign/:driverId`.
- **Payload**:
  ```json
  {
    "leaseDuration": 12,
    "monthlyRent": 45000,
    "notes": "Optional lease notes",
    "agreementVersion": "AGREEMENT_VERSION_ID",
    "generatedS3Key": "S3_KEY_OF_RENDERED_PDF"
  }
  ```
- **Success Outcome**:
  - Vehicle status changes to `ACTIVE — RENTED`.
  - A `Lease` record is created containing the contract links.

---
## Common Field Name Mapping (Check your `FormData`)
- `licenseFront` -> `drivingLicense.frontImage`
- `idFrontImage` -> `identityDocs.idFrontImage`
- `signedContract` -> `contract.signedS3Key`
