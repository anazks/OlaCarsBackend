# Frontend Guide: Insurance Module & Vehicle Onboarding Updates

## 1. New Insurance Module
A full CRUD module has been added to the backend for managing Insurance Policies.

### Endpoints (Base URL: `/api/insurance`)

- **Create Insurance (POST `/api/insurance/`)**
  - **Permissions:** Restricted to `COUNTRYMANAGER`, `BRANCHMANAGER`, and `FINANCESTAFF`.
  - **Payload Format:** `multipart/form-data` (FormData)
  - You must append all the standard JSON fields as textual keys, and attach the file under the key `policyDocument`.
  - **Example Usage (Frontend):**
    ```javascript
    const formData = new FormData();
    formData.append("provider", "Allianz");
    formData.append("policyNumber", "POL-123456789");
    formData.append("policyType", "FLEET");
    formData.append("coverageType", "COMPREHENSIVE");
    formData.append("startDate", "2026-01-01T00:00:00.000Z");
    formData.append("expiryDate", "2027-01-01T00:00:00.000Z");
    formData.append("insuredValue", "50000"); // Note: append converts to string
    formData.append("providerContact[name]", "John Doe"); // For nested objects
    formData.append("providerContact[phone]", "+1234567890");
    formData.append("providerContact[email]", "john@example.com");
    
    // Attach the actual file:
    formData.append("policyDocument", fileInput.files[0]);

    // Send via fetch/axios
    // axios.post('/api/insurance/', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
    ```

- **Get All Insurances (GET `/api/insurance/`)**
  - Requires standard auth. Returns all policies.

- **Get Single Insurance (GET `/api/insurance/:id`)**
  - Returns a specific policy by ID.

- **Update Insurance (PUT `/api/insurance/:id`)**
  - Update specific fields of an existing policy.

- **Delete Insurance (DELETE `/api/insurance/:id`)**
  - Removes a policy.

- **Upload Policy Document (POST `/api/insurance/:id/upload-document`)**
  - **Type:** `multipart/form-data`
  - **Field Name:** `policyDocument`
  - *Note: You can attach the document during the initial creation (`POST /api/insurance/`). This endpoint is primarily kept for **updating** or **retrying** an upload for an existing policy later.*

---

## 2. Vehicle Onboarding Changes

Historically, vehicle onboarding involved submitting nested insurance fields under `vehicleData.insurancePolicy`. **This has changed.**

### The New Flow
Instead of manually typing all insurance details while creating a vehicle, the user should be prompted to select an existing, eligible (active) insurance policy from a dropdown/list.

### Relevant Endpoint for Onboarding Dropdown
- **Get Eligible Insurances (GET `/api/insurance/eligible`)**
  - **Purpose:** Call this endpoint during the Vehicle Onboarding wizard.
  - **Returns:** An array of ONLY the `ACTIVE` insurance policies.
  - **Action:** Bind this data to a selection UI (e.g., a dropdown showing Policy Number & Provider).

### Vehicle Creation Update
- **Prior Payload Structure:**
  ```json
  {
    "basicDetails": { ... },
    "insurancePolicy": {
      "providerName": "...",
      "policyNumber": "...",
      ...
    }
  }
  ```

- **NEW Payload Structure (POST `/api/vehicle/`):**
  Remove the `insurancePolicy` object entirely. Instead, just send the `insuranceId` of the policy the user selected from the dropdown:
  ```json
  {
    "basicDetails": { ... },
    "insuranceId": "651a2b3c4d5e6f7a8b9c0d1e" // The ID from /api/insurance/eligible
  }
  ```
  *Note: The backend will automatically link the new vehicle to this insurance policy and push the vehicle's `_id` into the insurance policy's `vehicles` array.*

### Vehicle Document Upload Update
- **Endpoint:** `POST /api/vehicle/:id/upload-documents`
- **Change:** Do **NOT** send the `insuranceDocument` field to this endpoint anymore.
- Insurance documents are now strictly managed under the individual Insurance policy via the `/api/insurance/:id/upload-document` endpoint. Ensure the file upload component in the Vehicle wizard reflects this omission.
