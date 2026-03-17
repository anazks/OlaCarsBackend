# Workshop Module — Frontend Integration Guide

Welcome! This guide will help you build the **Workshop & Maintenance** side of the OlaCars app. It is designed for a beginner developer, so we will explain exactly what each page is for and how to talk to the backend.

---

## 🔑 1. Getting Started: Roles

The Workshop module is used by different people. Your UI should change based on who is logged in (`req.user.role`):

- **WORKSHOPSTAFF (Technician)**: They do the actual work. They see their assigned tasks and clock in/out.
- **BRANCHMANAGER**: They approve the costs, assign staff, and give the final "okay" to release the vehicle.
- **OPERATIONSTAFF**: They often create the initial work order when a vehicle fails an inspection.

---

## 📂 2. Page-by-Page Breakdown

### Page 1: Workshop Dashboard
**What is it for?** An overview of the workshop's health.
- **What to show:**
    - "Total Active Work Orders" (Count).
    - "SLA Breaches" (Work orders past their deadline).
    - "Ready for QC" (Work orders where tasks are done).
- **API to use:** `GET /api/work-orders` (Use the counts from the results).

---

### Page 2: Work Order List
**What is it for?** Finding specifically what needs to be worked on.
- **What to do:**
    - Create a table showing: `Work Order #`, `Vehicle`, `Type` (Preventive/Corrective), `Status`, and `Priority`.
    - Add filters for `Status` (e.g., Show only `IN_PROGRESS`).
- **API to use:** `GET /api/work-orders?status=IN_PROGRESS`

---

### Page 3: Create Work Order (The "New Job" Form)
**What is it for?** Starting a new maintenance record.
- **What to do:**
    - A form with: Vehicle (Search/Select), Type (Dropdown), Fault Description (Textarea), and Priority.
    - **Pro-tip:** When you select a vehicle, capture its current Odometer as an estimate.
- **API to use:** `POST /api/work-orders`

---

### Page 4: Work Order Detail (The "Execution" Screen) 🚀
*This is the most important page in the module.*

**What to do:**
1.  **Header:** Show the status clearly (e.g., "Status: PARTS_REQUESTED").
2.  **Labour Clock:** A big "Clock In" button.
    - When clicked, call the API with `action: "CLOCK_IN"`.
    - Change the button to "Clock Out" or "Pause".
3.  **Task List:**
    - Show tasks like "Change Oil", "Fix Brakes".
    - Each task needs a "Complete" button.
4.  **Parts Management:**
    - A section to "Add Parts".
    - Show if a part is "In Stock" or "Ordered".
5.  **Photos:** An upload area for repair photos.

**APIs to use:**
- `GET /api/work-orders/:id` (Get details).
- `POST /api/work-orders/:id/labour` (Clocking).
- `PUT /api/work-orders/:id/tasks/:taskId` (Complete tasks).
- `POST /api/work-orders/:id/photos` (Upload photos).

---

### Page 5: Quality Check (QC)
**What is it for?** Final verification before the car leaves.
- **What to do:**
    - Show a checklist (e.g., "Engine oil okay?", "Brakes tested?").
    - Technician must select "PASS" or "FAIL" for each item.
    - **Logic:** If anything fails, they must provide a note.
- **APIs to use:**
    - `POST /api/work-orders/:id/qc/generate` (Get the checklist).
    - `PUT /api/work-orders/:id/qc/submit` (Send the results).

---

### Page 6: Vehicle Release
**What is it for?** Giving the keys back.
- **What to do:**
    - Ask for the **Final Odometer Reading**.
    - **Logic:** It cannot be lower than the reading at entry!
- **API to use:** `PUT /api/work-orders/:id/release`

---

## 🛠 3. Important Logic for Beginners

### A. Status-Based UI (Conditional Rendering)
Don't let users click buttons they shouldn't!
- If status is `DRAFT`, only show "Submit for Approval".
- If status is `QUALITY_CHECK`, hide the "Clock In" button.
- If status is `CLOSED`, make everything "Read Only".

### B. The Progress Endpoint
Anytime you want to change the "Status" of a Work Order (e.g., from `DRAFT` to `PENDING_APPROVAL`), use the **Progress** endpoint:
- `PUT /api/work-orders/:id/progress`
- You must send the `targetStatus`.

### C. Error Handling
The backend will return a `400` error if they try to do something illegal.
- Example: "Cannot release vehicle — QC has not passed."
- **What to do:** Always show the `message` from the backend response in a Toast or Alert.

---

## 🔗 4. Reference
- **API Reference:** [WORKSHOP_API_REFERENCE.md](./WORKSHOP_API_REFERENCE.md)
- **Detailed Workflow:** [Workshop_Module_and_Vehicle_Onboarding_Progress.md](./Workshop_Module_and_Vehicle_Onboarding_Progress.md)

Happy Coding! 💻
