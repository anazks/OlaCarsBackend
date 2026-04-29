const express = require("express");
const router = express.Router();
const { getLedgerEntries } = require("../Controller/LedgerController");
const ManualJournalController = require("../Controller/ManualJournalController");
const { authenticate } = require("../../../shared/middlewares/authMiddleware");
const { authorize } = require("../../../shared/middlewares/roleMiddleWare");
const { hasPermission } = require("../../../shared/middlewares/permissionMiddleware");
const { ROLES } = require("../../../shared/constants/roles");

const VIEW_ACCESS_ROLES = [
    ROLES.ADMIN,
    ROLES.FINANCEADMIN,
    ROLES.COUNTRYMANAGER,
    ROLES.FINANCESTAFF,
];

const MANAGE_ROLES = [
    ROLES.ADMIN,
    ROLES.FINANCEADMIN,
    ROLES.FINANCESTAFF,
];

/**
 * @swagger
 * tags:
 *   name: Ledger
 *   description: Immutable Accounting Ledger APIs
 */

// Ledger Entries
router.get("/", authenticate, authorize(...VIEW_ACCESS_ROLES), hasPermission("LEDGER_VIEW"), getLedgerEntries);

// Manual Journals
router.post("/journals", authenticate, authorize(...MANAGE_ROLES), hasPermission("JOURNAL_CREATE"), ManualJournalController.createJournal);
router.get("/journals", authenticate, authorize(...VIEW_ACCESS_ROLES), hasPermission("JOURNAL_VIEW"), ManualJournalController.getJournals);

module.exports = router;
