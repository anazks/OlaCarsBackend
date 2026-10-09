const express = require("express");
const router = express.Router();
const controller = require("../Controller/PaymentPortalController");
const { authenticate } = require("../../../shared/middlewares/authMiddleware");
const { authorize } = require("../../../shared/middlewares/roleMiddleWare");
const { ROLES } = require("../../../shared/constants/roles");
const upload = require("../../../utils/multerConfig");
const {
  verifyPortalAccess,
  requireEntryAccess,
  requireApprovalAccess,
} = require("../Middleware/paymentPortalAuthMiddleware");

// All routes require primary system authentication
router.use(authenticate);

// ─────────────────────────────────────────────────────────────
// 1. ADMIN PROVISIONING ROUTES (System Admin only)
// ─────────────────────────────────────────────────────────────
router.get(
  "/admin/finance-admins",
  authorize(ROLES.ADMIN),
  controller.getFinanceAdmins
);

router.post(
  "/admin/set-mpin",
  authorize(ROLES.ADMIN),
  controller.setOrUpdateMpin
);

router.patch(
  "/admin/permissions/:financeAdminId",
  authorize(ROLES.ADMIN),
  controller.updatePermissions
);

router.post(
  "/admin/unlock/:financeAdminId",
  authorize(ROLES.ADMIN),
  controller.unlockFinanceAdmin
);

// ─────────────────────────────────────────────────────────────
// 2. MPIN AUTHENTICATION ROUTES (Financial Admins + Admin)
// ─────────────────────────────────────────────────────────────
router.get(
  "/auth/status",
  authorize(ROLES.FINANCEADMIN, ROLES.ADMIN),
  controller.getMpinStatus
);

router.post(
  "/auth/verify-mpin",
  authorize(ROLES.FINANCEADMIN, ROLES.ADMIN),
  controller.verifyMpin
);

// ─────────────────────────────────────────────────────────────
// 3. MASTER DATA LOOKUPS (Unlocked Portal Session)
// ─────────────────────────────────────────────────────────────
router.get(
  "/lookups/vendors",
  authorize(ROLES.FINANCEADMIN, ROLES.ADMIN),
  verifyPortalAccess,
  controller.getVendors
);

router.get(
  "/lookups/accounts",
  authorize(ROLES.FINANCEADMIN, ROLES.ADMIN),
  verifyPortalAccess,
  controller.getAccounts
);

// ─────────────────────────────────────────────────────────────
// 4. PAYMENT ENTRIES (Maker / Entry Access)
// ─────────────────────────────────────────────────────────────
router.post(
  "/entries",
  authorize(ROLES.FINANCEADMIN, ROLES.ADMIN),
  verifyPortalAccess,
  requireEntryAccess,
  upload.array("documents", 5),
  controller.createEntry
);

router.get(
  "/entries",
  authorize(ROLES.FINANCEADMIN, ROLES.ADMIN),
  verifyPortalAccess,
  controller.getEntries
);

router.get(
  "/entries/:id",
  authorize(ROLES.FINANCEADMIN, ROLES.ADMIN),
  verifyPortalAccess,
  controller.getEntryById
);

router.put(
  "/entries/:id",
  authorize(ROLES.FINANCEADMIN, ROLES.ADMIN),
  verifyPortalAccess,
  requireEntryAccess,
  upload.array("documents", 5),
  controller.updateAndResubmitEntry
);

router.delete(
  "/entries/:id",
  authorize(ROLES.FINANCEADMIN, ROLES.ADMIN),
  verifyPortalAccess,
  controller.deleteEntry
);

// ─────────────────────────────────────────────────────────────
// 5. APPROVALS WORKFLOW (Checker / Approval Access)
// ─────────────────────────────────────────────────────────────
router.get(
  "/approvals/pending",
  authorize(ROLES.FINANCEADMIN, ROLES.ADMIN),
  verifyPortalAccess,
  requireApprovalAccess,
  controller.getPendingApprovals
);

router.post(
  "/approvals/:id/approve",
  authorize(ROLES.FINANCEADMIN, ROLES.ADMIN),
  verifyPortalAccess,
  requireApprovalAccess,
  controller.approveEntry
);

router.post(
  "/approvals/:id/reject",
  authorize(ROLES.FINANCEADMIN, ROLES.ADMIN),
  verifyPortalAccess,
  requireApprovalAccess,
  controller.rejectEntry
);

module.exports = router;
