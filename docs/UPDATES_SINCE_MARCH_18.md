# Project Updates — Since March 18, 2026

The following features and bug fixes were implemented after the project progress was last recorded on March 18, 2026.

## 1. Vehicle & Insurance Onboarding Refactor
- **Optional Insurance**: Refactored the onboarding flow to make insurance optional during initial entry. Vehicles can now be created with or without an `insuranceId`.
- **Post-Activation Linkage**: Added logic to link insurance policies to vehicles after they have been onboarded.
- **Workflow Service Updates**: `VehicleWorkflowService.js` now handles transitions gracefully even if insurance details are pending.
- **Schema Updates**: Added `insuranceId` support to the Vehicle model.

## 2. Comprehensive Swagger Documentation
- **Interactive API Docs**: Integrated Swagger (OpenAPI 3.0) across the entire backend.
- **Full Coverage**: Added schemas and route annotations for:
    - Authentication & User Management
    - Vehicle & Fleet Lifecycle
    - Driver Onboarding
    - Merchant & Rider Modules
- **Location**: Documentation is accessible via the `/api-docs` endpoint.

## 3. Enhanced Document Management
- **Multi-Photo Support**: Added support for `interiorPhotos` and fixed mapping for `exteriorPhotos` to allow multiple S3 uploads.
- **Improved Field Mapping**: Corrected field name mismatches (e.g., `roadTaxDisc`) to align with frontend requests.
- **Robust Uploads**: Fixed 500 errors and added logging to the `upload-documents` endpoint to ensure successful S3 integrations.

## 4. Driver Onboarding & Legal Agreements
- **Contract Generation**: Implemented a system to render driver agreements with dynamic placeholder replacement.
- **Agreement Types**: Expanded support for `DRIVER_AGREEMENT` and `LEGAL_AGREEMENT` in validation schemas.
- **S3 Storage**: Automated storage of both system-generated and user-signed contract PDFs.

## 5. Critical Bug Fixes & Stability
- **Validation Relaxation**: Removed strict requirements for `make`, `model`, and `VIN` during the initial `PENDING ENTRY` phase.
- **Middleware Fixes**: Resolved the "next is not a function" error in Mongoose pre-save hooks.
- **API Resilience**: Fixed `countryBranches.map` crashes and fixed socket events (`newOrder`, `orderAssigned`) for real-time notifications.

---

## 6. AI Service & Workshop Inventory Integration (April 7, 2026)
- **AI Pre-booking Module**: Implemented unauthenticated endpoints (`/api/ai/vehicles/available`, `/api/ai/vehicles/book`) for automated vehicle discovery and booking.
- **Draft Driver Creation**: Automated "DRAFT" driver profile generation using phone numbers during the AI booking flow.
- **Atomic Stock Management**: Developed `reserveStock`, `releaseStock`, and `deductStock` in `InventoryPartRepo.js` to ensure real-time stock accuracy using MongoDB atomics.
- **Work Order Billing**: Fixed the `POST /api/work-orders/:id/billing/generate` endpoint and implemented comprehensive service bill generation linking to Work Orders.
- **S3 Media for Repairs**: Enabled S3-backed photo upload capabilities (`/api/work-orders/:id/photos/upload`) for documenting vehicle condition and QC results.
- **Part Lifecycle Tracking**: Implemented a `PartTransaction` system to log all stock movements (Restock, Reserve, Install, Return).
