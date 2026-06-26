const express = require("express");
const router = express.Router();
const AccountingController = require("../Controller/AccountingController");
const { authenticate } = require("../../../shared/middlewares/authMiddleware");
const { authorize } = require("../../../shared/middlewares/roleMiddleWare");
const { ROLES } = require("../../../shared/constants/roles");
const excelUpload = require("../../../utils/excelUpload");

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

// Bulk ledger entries import
router.post("/ledger/import", authenticate, authorize(...MANAGE_ROLES), excelUpload.single("file"), AccountingController.importLedger);

// Import progress polling
router.get("/ledger/import/progress/:importId", authenticate, authorize(...MANAGE_ROLES), AccountingController.getImportProgress);

// Download sample Excel template
router.get("/ledger/sample", authenticate, authorize(...VIEW_ACCESS_ROLES), AccountingController.getSampleExcel);

// Fetch previous import histories
router.get("/import-history", authenticate, authorize(...VIEW_ACCESS_ROLES), AccountingController.getImportHistory);

module.exports = router;
