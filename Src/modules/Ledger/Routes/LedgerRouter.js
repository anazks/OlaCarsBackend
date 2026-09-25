const express = require("express");
const router = express.Router();
const { 
    getLedgerEntries, 
    getLedgerEntryById, 
    updateLedgerEntry, 
    deleteSingleLedgerEntry,
    importLedgerEntries, 
    deleteLedgerJournal, 
    clearLedgerByCode 
} = require("../Controller/LedgerController");
const ManualJournalController = require("../Controller/ManualJournalController");
const { authenticate } = require("../../../shared/middlewares/authMiddleware");
const { authorize } = require("../../../shared/middlewares/roleMiddleWare");
const { hasPermission } = require("../../../shared/middlewares/permissionMiddleware");
const { ROLES } = require("../../../shared/constants/roles");
const excelUpload = require("../../../utils/excelUpload");
const upload = require("../../../utils/multerConfig");

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

// Manual Journals
router.post("/journals/bulk-upload", authenticate, authorize(...MANAGE_ROLES), hasPermission("JOURNAL_CREATE"), ManualJournalController.bulkUploadJournals);
router.post("/journals", authenticate, authorize(...MANAGE_ROLES), hasPermission("JOURNAL_CREATE"), ManualJournalController.createJournal);
router.get("/journals", authenticate, authorize(...VIEW_ACCESS_ROLES), hasPermission("JOURNAL_VIEW"), ManualJournalController.getJournals);
router.get("/journals/:id", authenticate, authorize(...VIEW_ACCESS_ROLES), hasPermission("JOURNAL_VIEW"), ManualJournalController.getJournalById);
router.put("/journals/:id", authenticate, authorize(...MANAGE_ROLES), ManualJournalController.updateJournal);
router.patch("/journals/:id", authenticate, authorize(...MANAGE_ROLES), ManualJournalController.updateJournal);
router.delete("/journals/:id", authenticate, authorize(...MANAGE_ROLES), ManualJournalController.deleteJournal);

// Bulk Import
router.post("/import", authenticate, authorize(...MANAGE_ROLES), excelUpload.single("file"), importLedgerEntries);

// Ledger Entries
router.get("/", authenticate, authorize(...VIEW_ACCESS_ROLES), hasPermission("LEDGER_VIEW"), getLedgerEntries);
router.delete("/clear/:accountingCode", authenticate, authorize(...MANAGE_ROLES), clearLedgerByCode);
router.delete("/entries/:id", authenticate, authorize(...MANAGE_ROLES), hasPermission("LEDGER_DELETE"), deleteSingleLedgerEntry);
router.get("/:id", authenticate, authorize(...VIEW_ACCESS_ROLES), hasPermission("LEDGER_VIEW"), getLedgerEntryById);
router.put("/:id", authenticate, authorize(...MANAGE_ROLES), hasPermission("LEDGER_EDIT"), upload.array("files", 5), updateLedgerEntry);
router.delete("/:id", authenticate, authorize(ROLES.ADMIN), deleteLedgerJournal);

module.exports = router;
