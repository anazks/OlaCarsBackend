# OLA CARS FLEET MANAGEMENT SYSTEM
## Driver & Customer Onboarding Workflow
**Staff Procedures | Experian Credit Reporting Integration**

> Document Ref: OLA-ONBOARD-02 | Version 1.0 | February 2026
> Prepared by: Byteboot Techno Solutions Pvt Ltd | For: Ola Cars / Naventra Exports Private Limited

---

## Document Scope

| Covers | Driver Onboarding Flow, Customer Onboarding Flow, Experian API Credit Check Integration, Credit Reporting on Default |
|--------|---|
| **Staff Roles Involved** | Operations Staff, Finance Staff, Branch Manager, Country Manager |
| **System Modules Used** | Drivers Module, Customer Portal, Financial Management, Collection Automation, Experian API Integration |
| **API Integration** | Experian Consumer Credit API — Credit Check (onboarding) + Tradeline Reporting (default/payment) |

---

## SECTION 1: DRIVER ONBOARDING WORKFLOW

The driver onboarding process is managed entirely by **Operations Staff** within the branch, with **Branch Manager** approval at key decision gates. The **Experian credit check is a mandatory step** before any driver contract can be issued.

### 1.1 Step-by-Step Driver Onboarding Flow

| Step | Action | Staff Owner | System Action |
|------|--------|-------------|---------------|
| 1 | **Initial Driver Enquiry & Profile Creation** | Operations Staff | System creates new driver profile record; status set to `NEW APPLICATION`; document upload portal enabled |
| 2 | **Document Collection & Upload** | Operations Staff | System validates each document type uploaded; missing documents flagged in red; auto-reminder sent to staff on Day 3 if incomplete |
| 3 | **Driving License Verification** | Operations Staff | System records license number, country, expiry date; sets alert 60 days before expiry; API verify with transport authority if integration available |
| 4 | **Background Check Upload** | Operations Staff | System stores certified background/criminal record document; flags if missing after 5 business days; alert sent to Branch Manager |
| 5 | **Experian Credit Check — MANDATORY** | Operations Staff (initiates) + Branch Manager (reviews borderline cases) | System calls Experian Consumer API; score returned in 3–10 seconds; auto-decision applied; borderline cases (500–649) flagged for Branch Manager review |
| 6 | **Contract Generation & Signing** | Operations Staff | System auto-generates driver contract PDF from template; email sent to driver with contract attached; contract status set to `PENDING SIGNATURE` |
| 7 | **Driver Account Activation** | Branch Manager | System generates login credentials; welcome email sent to driver; driver appears on fleet dashboard; GPS monitoring profile activated |

### 1.2 Driver Required Documents Checklist

| Document / Requirement | Staff Action | System Action |
|------------------------|-------------|---------------|
| Full legal name, date of birth, nationality | Enter into system | Auto-populates driver profile |
| National ID card / Passport (front + back photo upload) | Scan and upload to system | Stored in AWS S3, linked to driver record |
| Valid driving license (front + back, all categories noted) | Upload + enter expiry date | System sets auto-expiry alert 60 days before |
| Driving license verification — check validity with transport authority | Manual check or API verify | System records verification status |
| Background check — criminal record certificate | Upload certified document | Stored; alert if not provided within 5 days |
| Residential address proof (utility bill / bank statement < 3 months) | Upload document | System validates document date |
| Passport-size photograph | Upload to profile | Set as driver profile photo in system |
| Emergency contact name, relationship, and phone number | Enter into system | Stored in driver profile |
| Bank account details for salary/commission payments | Enter account details | Encrypted and stored — finance module only |
| Medical fitness certificate (if required by country regulations) | Upload | System alert if missing and country requires it |
| Experian credit check consent form (signed) | Upload signed form | Prerequisite for Experian API call — system blocks check without consent |

### 1.3 Driver Onboarding Status Flow

| Status | Staff Action | System Action | Owner | Record Status |
|--------|-------------|---------------|-------|---------------|
| `NEW APPLICATION` | Staff creates driver record and begins document collection | Profile created; document upload enabled | Operations Staff | Incomplete |
| `DOCUMENTS SUBMITTED` | All required documents uploaded and verified by staff | System validates all required fields are complete | Operations Staff | Under Review |
| `CREDIT CHECK INITIATED` | Staff submits Experian credit check request | API call to Experian; result returned in system | Operations Staff | Pending Credit |
| `CREDIT APPROVED` | Score >= 650 — auto-approved; Score 500–649 — Branch Manager review | Status updates; contract generation unlocked | System / Branch Mgr | Approved |
| `CONTRACT ISSUED` | System generates driver contract; staff sends to driver for signature | Contract PDF generated; email sent to driver | Operations Staff | Contract Pending |
| `CONTRACT SIGNED` | Driver returns signed contract; staff uploads to system | Signed contract stored; driver account activation enabled | Operations Staff | Ready to Activate |
| `ACTIVE DRIVER` | Branch Manager activates driver account in system | Login credentials sent; GPS monitoring activated; driver appears on fleet dashboard | Branch Manager | Active |
| `SUSPENDED / INACTIVE` | GPS score breach, document expiry, or Branch Manager action | Driver removed from available assignments; alert sent to Branch Manager | System / Branch Mgr | Suspended |

---

## SECTION 2: CUSTOMER ONBOARDING WORKFLOW

Customer onboarding is handled jointly by **Finance Staff** (financial and credit checks) and **Operations Staff** (vehicle assignment). The **Branch Manager** must approve any exception to the credit scoring thresholds before a rental agreement can be executed.

### 2.1 Step-by-Step Customer Onboarding Flow

| Step | Action | Staff Owner | System Action |
|------|--------|-------------|---------------|
| 1 | **Customer Enquiry & Profile Creation** | Operations Staff / Finance Staff | System creates customer lead record; status: `ENQUIRY`; customer portal account created (inactive until approval) |
| 2 | **Document Collection & Upload** | Finance Staff | System validates document completeness; flags missing items; auto-reminder sent on Day 3 if documents outstanding |
| 3 | **Driving License Verification (Customer)** | Finance Staff | System records customer license details; verifies license is valid for rental country and vehicle category; blocks contract if license is expired |
| 4 | **Experian Credit Check — MANDATORY** | Finance Staff (initiates) + Branch Manager (reviews < 620 score) | Experian Consumer API called; credit score and risk report returned; deposit amount rule applied automatically based on score bracket; fraud alerts block application immediately |
| 5 | **Security Deposit Calculation & Payment** | Finance Staff | System calculates required deposit based on credit score rules; payment link generated; deposit recorded as liability in accounting module on receipt |
| 6 | **Rental Agreement Generation & Signing** | Finance Staff | System auto-generates rental contract PDF; email sent to customer; customer signs (in-person or e-signature); signed copy uploaded and stored in system |
| 7 | **Vehicle Assignment & Handover** | Operations Staff | System assigns selected vehicle; vehicle status changes to `RENTED`; pre-delivery inspection checklist completed; rental start date and mileage recorded; GPS monitoring active; customer portal activated |
| 8 | **Vehicle Return & Rental Closure** | Operations Staff | Return inspection checklist completed; any damage recorded with photos; rental closed in system; vehicle status set to `AVAILABLE`; deposit refund triggered if no issues |

### 2.2 Customer Required Documents Checklist

| Document / Requirement | Staff Action | System Action |
|------------------------|-------------|---------------|
| Full legal name, date of birth, nationality, occupation | Enter into system | Auto-populates customer profile |
| National ID / Passport (front + back) | Upload to system | Stored in AWS S3, linked to customer record |
| Valid driving license — must hold valid license for rental country | Upload + enter expiry date | System blocks rental if license expired |
| Proof of address (utility bill / bank statement < 3 months) | Upload document | System validates date range |
| Contact information — email, primary phone, WhatsApp number | Enter into system | Used for automated reminder system |
| Emergency / guarantor contact details | Enter into system | Required for high-value or long-term rentals |
| Credit check consent form (signed) | Upload signed form | Prerequisite for Experian API — system blocks rental agreement without consent |
| Rental agreement / contract (system-generated) | Print / email to customer | Auto-generated from system template; customer signs; uploaded back |
| Security deposit payment confirmation | Record payment in system | Payment recorded in financial module; receipt issued |
| Insurance preference selection (if optional) | Record in customer profile | Links to vehicle insurance record |

### 2.3 Customer Onboarding Status Flow

| Status | Staff Action | System Action | Owner | Record Status |
|--------|-------------|---------------|-------|---------------|
| `NEW ENQUIRY` | Staff creates customer lead / enquiry record | Customer profile created; no rental rights yet | Operations / Finance Staff | Enquiry |
| `DOCUMENTS COLLECTED` | Staff collects and uploads all required customer documents | System validates completeness; shows missing items | Finance Staff | Docs Pending |
| `CREDIT CHECK INITIATED` | Finance Staff submits Experian credit check | API call to Experian; result returned and stored | Finance Staff | Credit Check |
| `CREDIT APPROVED` | Score >= 620 — approved; Score 500–619 — approved with higher deposit; < 500 — decline | System applies deposit rules; contract generation unlocked | System / Branch Mgr | Credit OK |
| `RENTAL AGREEMENT ISSUED` | System generates rental contract with correct deposit amount; staff sends to customer | Contract PDF auto-generated; email sent; payment link included | Finance Staff | Agreement Sent |
| `DEPOSIT PAID` | Customer pays security deposit; Finance Staff records payment | Payment recorded in financial module; deposit liability account credited | Finance Staff | Deposit Paid |
| `VEHICLE ASSIGNED` | Operations Staff assigns vehicle to customer; return inspection checklist completed | Vehicle status changes to Rented; GPS monitoring active; rental clock starts | Operations Staff | Active Rental |
| `RENTAL COMPLETE` | Vehicle returned; return inspection done; staff confirms no damage | Rental closed; vehicle status set to Available; deposit refund process triggered | Operations Staff | Completed |
| `OVERDUE / DEFAULTED` | Payment not received by due date; automated reminders sent | Escalation matrix activated; Day 15+ triggers Experian adverse report | System / Branch Mgr | Overdue |

---

## SECTION 3: EXPERIAN CREDIT API — INTEGRATION & REPORTING WORKFLOW

The system integrates with the **Experian Consumer Credit API** for two distinct purposes:
1. **Pre-onboarding creditworthiness assessment** for both drivers and customers
2. **Adverse tradeline reporting** for overdue/defaulted rental accounts

> **IMPORTANT:** The Experian API account, credentials, and all usage fees are the **Client's** (Ola Cars / Naventra Exports) sole responsibility. Byteboot provides the integration framework only.

### 3.1 Complete Experian API Flow — Driver, Customer & Collection Reporting

| Phase | Action | API Call / Data | Trigger | Owner |
|-------|--------|-----------------|---------|-------|
| **DRIVER ONBOARDING** | Staff collects driver consent for credit check | No API call — consent form signed | Before application submission | Operations Staff |
| **DRIVER ONBOARDING** | Staff submits driver personal data to Experian | `POST /consumers/v1/creditreports` — Full Name, DOB, NIC/Passport, Address | Staff clicks 'Run Credit Check' in system | Operations Staff |
| **DRIVER ONBOARDING** | System receives Experian credit score and report | Response: Credit Score (300–850), Payment History, Defaults, Bankruptcies, Open Accounts | Automatic — API response in 3–10 seconds | System (auto) |
| **DRIVER ONBOARDING** | System applies scoring rules and flags result | Score >= 650: APPROVE \| Score 500–649: REVIEW \| Score < 500: DECLINE | Automated rule engine post API response | System (auto) |
| **DRIVER ONBOARDING** | Branch Manager reviews flagged or borderline cases | Report stored in driver record — immutable audit trail | Score 500–649 triggers manual review alert | Branch Manager |
| **CUSTOMER ONBOARDING** | Staff collects customer ID and signed consent | No API call — consent recorded in system | Before rental agreement execution | Finance Staff / Branch Manager |
| **CUSTOMER ONBOARDING** | Staff submits customer data to Experian | `POST /consumers/v1/creditreports` — Full Name, DOB, ID Number, Address, Email | Staff clicks 'Check Credit' on customer record | Finance Staff |
| **CUSTOMER ONBOARDING** | System receives report and stores result | Response: Credit Score, Debt-to-Income ratio, Active Loans, Late Payment history, Fraud Alerts | Automatic — real-time | System (auto) |
| **CUSTOMER ONBOARDING** | System applies rental eligibility rules | Score >= 620: APPROVE (standard deposit) \| Score 500–619: APPROVE (higher deposit) \| Score < 500: DECLINE or requires guarantor | Post API response — automated | System (auto) |
| **CUSTOMER ONBOARDING** | Branch Manager approves exceptions or declines | Credit check result attached permanently to customer rental agreement record | Score < 500 or fraud alert requires manual override approval | Branch Manager |
| **COLLECTION REPORTING** | Day 15+ overdue — system triggers adverse reporting | `POST /consumers/v1/tradelines` — Account status: DELINQUENT, Amount overdue, Days past due | Automated — Day 15 overdue trigger | System (auto) — Country Manager notified |
| **COLLECTION REPORTING** | Branch Manager reviews and approves adverse report | Branch Manager clicks 'Confirm Report to Experian' — cannot be reversed | Manual confirmation required before final submission | Branch Manager + Country Manager approval |
| **COLLECTION REPORTING** | Payment received — update tradeline to PAID/SETTLED | `PATCH /consumers/v1/tradelines/{id}` — Status: PAID, Settlement date recorded | Triggered when full payment posted in system | System (auto) |
| **COLLECTION REPORTING** | Annual credit reporting summary | `GET /consumers/v1/portfolio-report` — bulk periodic reporting | Scheduled — monthly or as required by country regulations | Country Manager review |

### 3.2 Credit Score Decision Rules

| Score Range | Rating | Driver Decision | Customer Decision | Action Owner |
|-------------|--------|----------------|-------------------|--------------|
| **750 – 850** | Excellent | APPROVED — fast-track onboarding | APPROVED — standard deposit applies | System auto-approves |
| **650 – 749** | Good | APPROVED — standard contract | APPROVED — standard deposit | System auto-approves |
| **500 – 649** | Fair | MANUAL REVIEW — Branch Manager required | APPROVED — higher deposit required (+25%) | Branch Manager reviews within 24 hrs |
| **350 – 499** | Poor | DECLINE — or co-signer required | DECLINE — or guarantor + security deposit | Branch + Country Manager approval for exceptions |
| **Below 350** | Very Poor | DECLINE — cannot onboard | DECLINE — no exceptions permitted | Group CEO only can override in writing |
| **Fraud Alert** | BLOCKED | IMMEDIATE DECLINE — Security notified | IMMEDIATE DECLINE — Legal team alerted | Country Manager + Legal — no exceptions |

### 3.3 Experian API Technical Specifications

| Parameter | Details |
|-----------|---------|
| **API Provider** | Experian Consumer Credit API — Client must hold active Experian API subscription |
| **Authentication** | OAuth 2.0 Client Credentials Flow — API Key + Secret provided by Experian to Client |
| **Credit Check Endpoint** | `POST /consumers/v1/creditreports` — returns full credit report with score, payment history, defaults |
| **Tradeline Reporting Endpoint** | `POST /consumers/v1/tradelines` — used for adverse reporting; `PATCH` to update on payment receipt |
| **Response Time** | Typical: 3–10 seconds. System shows loading indicator and confirms result on screen |
| **Data Fields Sent** | Full legal name, date of birth, national ID/passport number, current address, email address |
| **Data Fields Received** | Credit score (300–850), payment history, active accounts, defaults, bankruptcies, fraud alerts, debt-to-income ratio |
| **Consent Requirement** | Written consent form signed by applicant MANDATORY before API call — system blocks request without uploaded consent |
| **Data Storage** | Full report stored in AWS S3, linked to applicant record. Immutable audit trail. Retained per applicable data protection regulations |
| **Retry Policy** | Up to 3 automatic retries on API timeout. After 3 failures, system flags record for manual retry and notifies Branch Manager |
| **Adverse Reporting Consent** | Rental agreement terms must include clause authorising Ola Cars to report payment defaults to credit bureaus — Client's legal responsibility to include |

---

## SECTION 4: ESCALATION MATRIX — ONBOARDING EXCEPTIONS

Any onboarding case that does not meet automatic approval criteria must follow the escalation matrix below. **No exceptions may be granted below the stated approval level.**

### 4.1 Escalation Scenarios

| Scenario | Who Reviews | Decision Options | System Outcome |
|----------|------------|-----------------|----------------|
| Credit score 500–649 (borderline) | Branch Manager | Approve with conditions / Decline / Request additional docs | Branch Manager selects outcome; system records decision with reason |
| Credit score < 500 (poor) | Branch Manager + Country Manager | Decline / Approve with guarantor + extra deposit | Both must sign off digitally in system |
| Fraud alert flagged by Experian | Country Manager + Legal team | Immediate decline — no exceptions without Group CEO written override | Record locked; security notification issued; cannot proceed |
| Missing documents after 5 business days | Operations Staff escalates to Branch Manager | Send reminder or close application | System sends automated document reminder on Day 3 and Day 5 |
| Customer requests exception on deposit amount | Branch Manager | Approve reduction / Deny / Offer instalment | Any deposit change requires Branch Manager system approval before contract generation |

### 4.2 Document Expiry Monitoring — Post Onboarding

| Document | Alert Trigger | Notified Party | Action Required |
|----------|--------------|----------------|-----------------|
| Driving license (driver or customer) | 60 days before expiry | Operations Staff + Branch Manager | Request renewal copy from driver/customer |
| Vehicle insurance policy | 60 days before expiry | Branch Manager + Country Manager | Renew policy; update system record |
| Driver contract renewal | 30 days before expiry | Operations Staff | Initiate contract renewal workflow |
| Medical fitness certificate | 30 days before expiry | Operations Staff | Request updated certificate from driver |
| Background check (periodic refresh) | Annually / as per country regulation | Operations Staff + Branch Manager | Request fresh background check; run Experian re-check if policy requires |
| Rental agreement (customer renewal) | 14 days before rental end date | Finance Staff + Customer (AI chatbot notification) | Offer extension or plan vehicle return date |

---

> *Document Ref: OLA-ONBOARD-02 | Byteboot Techno Solutions Pvt Ltd | February 2026 | Confidential — Internal Use Only*
