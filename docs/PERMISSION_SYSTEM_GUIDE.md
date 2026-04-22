# Dynamic Hierarchical Permission System Documentation

This document outlines the architecture, implementation details, and usage guide for the dynamic permission system implemented in the OlaCars Backend.

## Overview
The system moves away from hardcoded role-based access control (RBAC) to a granular, permission-based system. Each user now has a specific list of actions they are authorized to perform.

### Key Features
- **Granular Permissions**: Actions are defined as specific strings (e.g., `VEHICLE_VIEW`, `STAFF_CREATE`).
- **Hierarchical Delegation**: Creators (e.g., Branch Managers) can only grant permissions they themselves possess.
- **Role Templates**: Standard sets of permissions are defined for roles to simplify user creation.
- **Grant-All Migration**: All existing users were initialized with all permissions to ensure zero disruption.

---

## 1. Permission Constants
All available system permissions are defined in a central location:
- **File**: `Src/modules/AccessControl/Constants/permissions.js`

This file contains the `PERMISSIONS` object and an `ALL_PERMISSIONS` array. Always add new actions here to make them available across the system.

## 2. Database Schema Changes
A `permissions` field has been added to all staff-related models:
- **Models Updated**: `Admin`, `BranchManager`, `CountryManager`, `FinanceAdmin`, `FinanceStaff`, `OperationAdmin`, `OperationStaff`, `WorkshopManager`, `WorkshopStaff`, and `User`.
- **Field Definition**:
  ```javascript
  permissions: {
      type: [String],
      default: []
  }
  ```

## 3. Role Templates
Role templates define the "default" permissions a user gets when created if no specific permissions are provided.
- **Model**: `Src/modules/AccessControl/Model/RoleTemplate.js`
- **Management**: Admins can update these templates via the Access Control routes.

## 4. Authorization Middleware
To protect routes, use the `hasPermission` middleware.
- **File**: `Src/shared/middlewares/permissionMiddleware.js`
- **Usage**:
  ```javascript
  const { hasPermission } = require("../../../shared/middlewares/permissionMiddleware");

  // Protect a route
  router.post("/", authenticate, hasPermission("VEHICLE_CREATE"), controller.create);
  ```

## 5. Hierarchical Delegation Logic
When a new staff member is created, the system validates that the creator is not "elevating" permissions.
- **Logic Location**: `validateDelegatedPermissions` function in service layers (implemented in `OperationStaffService.js`).
- **Rule**: `NewUser.permissions` must be a subset of `Creator.permissions`.
- **Exception**: Super Admins (`role: "ADMIN"`) can assign any permission.

## 6. Access Control Module
A new internal module handles the management of permissions and templates.
- **Routes**: `/api/access-control`
- **Endpoints**:
  - `GET /permissions`: List all system permissions.
  - `GET /templates`: List all role templates.
  - `POST /templates`: Create or update a role template.

## 7. Maintenance & Migration
- **Migration Script**: `scripts/grant-all-permissions.js` was used to initialize existing users.
- **Adding New Permissions**:
  1. Add the string to `permissions.js`.
  2. (Optional) Add it to relevant `RoleTemplates`.
  3. Update routes with `hasPermission("NEW_ACTION")`.

---
**Note**: This system is designed to be flexible. Permissions are evaluated at runtime by checking the user's `permissions` array in the database.
