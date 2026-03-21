# Frontend Integration Guide: Agreement, Lease & E-Signatures

This guide provides the workflow and API details for integrating the Agreement and Lease systems, including vehicle assignment, dynamic templates, and e-signatures.

---

## 1. Overall Workflow Overview

To properly implement the "Car Assignment to Agreement" flow, follow these steps:

1.  **Admin Template Creation**: Staff creates an agreement template (e.g., "Standard Rental Contract") using `{{TAGS}}`.
2.  **Vehicle Assignment**: Staff assigns an available car to a selected driver. **The frontend must collect the lease duration and monthly rent at this step.**
3.  **Automatic Lease Creation**: The backend creates a `Lease` record based on the assignment data.
4.  **Driver Notification**: The driver is told they have a pending contract to sign.
5.  **Personalized Rendering**: The frontend fetches the rendered HTML, which now includes the vehicle details AND the lease duration/rent.
6.  **Signature Submission**: The driver signs, and the agreement is marked as accepted.

---

## 2. Page-by-Page Implementation

### A. Admin: Agreement Template Editor
- **UI**: A TipTap-based text editor.
- **Context**: Admins use `{{TAGS}}` to define where dynamic data should go.
- **Supported Tags**: Call `GET /api/agreements/placeholders` to get the list.
    - *New Tags*: `{{LEASE_DURATION}}` and `{{LEASE_MONTHLY_RENT}}` are now available.
- **Endpoint**: `POST /api/agreements` to save the template.

### B. Staff: Vehicle Assignment Page
When a staff member clicks "Assign Car" on a vehicle:
1.  **UI**: Show a modal or page to select a **Driver**.
2.  **New Fields (Required)**:
    - **Lease Duration**: A number input (e.g., "12 Months").
    - **Monthly Rent**: A currency/number input (e.g., "1500").
    - **Notes**: (Optional) For internal audit.
3.  **API Call**: 
    - **Endpoint**: `POST /api/vehicle/:id/assign/:driverId`
    - **Payload**:
      ```json
      {
        "leaseDuration": 12,
        "monthlyRent": 1500,
        "notes": "Assigning for 1 year rental"
      }
      ```
    - **Result**: This single call updates the vehicle status, driver status, and **creates a Lease record** in the background.

### C. Driver: Contract Signing Page
This page is for the driver to review and sign their specific contract.

1.  **Fetch Rendered HTML**: 
    - **Endpoint**: `GET /api/agreements/:agreementId/render`
    - **Logic**: Use the `driverToken` for authentication. The backend will automatically find the latest active lease and fill in the `{{LEASE_DURATION}}` and `{{LEASE_MONTHLY_RENT}}` tags.
2.  **Signature Component**:
    - **Typed**: A text input for the name.
    - **Drawn**: A canvas for a physical signature.
3.  **Submission**:
    - **Endpoint**: `POST /api/agreements/accept`
    - **Payload**: Send as `multipart/form-data` if a canvas/image is used.

---

## 3. Implementation Checklist for Frontend

### [ ] Vehicle Assignment Modal
- Add `leaseDuration` (number) and `monthlyRent` (number) inputs.
- Ensure validation: these are now mandatory for assignment.

### [ ] Placeholder Sidebar
- Ensure the sidebar in the Agreement Editor includes the new lease tags.

### [ ] Driver "Action Required" Banner
- Logic: Check `GET /api/agreements/verify/:driverId/:agreementId`.
- If `accepted: false`, show a prominent banner: "Please sign your rental agreement to activate your vehicle."

---

## 4. API Summary Table

| Context | Action | Method | Endpoint | Note |
| :--- | :--- | :--- | :--- | :--- |
| **Agreement** | Manage | POST | `/api/agreements` | Create/Update template |
| **Agreement** | Placeholders | GET | `/api/agreements/placeholders` | List all `{{TAGS}}` |
| **Assignment** | Assign Car | POST | `/api/vehicle/:id/assign/:dId` | Requires `leaseDuration`, `monthlyRent` |
| **Driver** | Verify Sign | GET | `/api/agreements/verify/:uId/:aId` | Check if signed |
| **Driver** | Render | GET | `/api/agreements/:id/render` | Get HTML with Lease & Car data |
| **Driver** | Sign | POST | `/api/agreements/accept` | Submit signature (Multipart) |
