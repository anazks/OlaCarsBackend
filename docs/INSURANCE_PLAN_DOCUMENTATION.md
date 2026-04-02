# Insurance Plan Module Documentation

## Overview
The Insurance Plan module handles the high-level relationship between the organization and insurance providers. An "Insurance Plan" acts as a template or container for a specific insurance policy (e.g., a Fleet-wide comprehensive plan from Allianz). 

Individual vehicle insurance details (specific certificate numbers, specific validity dates, and digital copies) are attached to each vehicle while referencing one of these master plans.

---
    
## 1. Supplier Integration
Insurance providers are now strictly integrated with the **Supplier** module.
- **Mandatory Link**: Every Insurance Plan **must** be linked to a Supplier.
- **Dropdowns**: Frontend must fetch suppliers for the insurance plan form using:
  `GET /api/supplier?category=Insurance`

---

## 2. Creating an Insurance Plan (Frontend Guide)
**Endpoint**: `POST /api/insurance/`  
**Content-Type**: `multipart/form-data`

### **Required Fields**
| Field | Type | Description |
| :--- | :--- | :--- |
| **`supplier`** | ObjectId | The ID of the Supplier (category: `Insurance`). **Must** be a valid ID from the Supplier list. |
| **`country`** | String | e.g. "Ghana", "Nigeria". (Required to scope plans correctly). |

### **Optional Fields (Master Plan Level)**
| Field | Type | Description |
| :--- | :--- | :--- |
| `policyType` | Enum | `FLEET` (default) or `INDIVIDUAL`. |
| `coverageType`| Enum | `THIRD_PARTY` or `COMPREHENSIVE`. |
| `insuredValue`| Number | Total sum insured for the plan. |
| `policyNumber`| String | The Master Policy Number. |
| `startDate` | Date | Master policy start date. |
| `expiryDate` | Date | Master policy expiry date. |
| `policyDocument`| File | PDF/Image of the master policy agreement. |

---

## 3. Onboarding a Vehicle (Workflow Linkage)
When a vehicle reaches the **INSURANCE VERIFICATION** stage, the following steps are performed:

### Step A: Selection
The user selects an active plan from the list:
`GET /api/insurance/eligible`

### Step B: Specific Details
When progressing the vehicle state via `PUT /api/vehicle/:id/progress`, the frontend sends the specific car's insurance details:
- `insuranceId`: Reference to the master Insurance Plan.
- `insuranceDetails.insuranceNumber`: This car's specific cert number.
- `insuranceDetails.fromDate`: This car's start date.
- `insuranceDetails.toDate`: This car's expiry date.

### Step C: Document Upload
Upload the car's specific insurance certificate:
**Endpoint**: `POST /api/vehicle/:id/upload-documents`  
**Field Name**: `insuranceCertificate`

---

## 4. Key API Endpoints Summary

| Method | Route | Description |
| :--- | :--- | :--- |
| `GET` | `/api/insurance/` | List all plans (filtered by user country). |
| `GET` | `/api/insurance/eligible` | List only `ACTIVE` plans for onboarding. |
| `POST` | `/api/insurance/` | Create a new Plan (Supports file upload). |
| `PUT` | `/api/insurance/:id` | Update plan details. |
| `DELETE` | `/api/insurance/:id` | Delete a plan. |
