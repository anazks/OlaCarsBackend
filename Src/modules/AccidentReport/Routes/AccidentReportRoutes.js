const express = require("express");
const router = express.Router();
const {
    submitAccidentReport,
    getMyReports,
    getReportsByBranch,
    getAllReports,
    getReportById,
    updateReportStatus,
} = require("../Controller/AccidentReportController");

const { authenticate } = require("../../../shared/middlewares/authMiddleware");
const { authorize } = require("../../../shared/middlewares/roleMiddleWare");
const { ROLES } = require("../../../shared/constants/roles");
const upload = require("../../../utils/multerConfig");

// ── Driver Routes (USER role) ────────────────────────────────────────────────

// POST /api/accident-reports/submit  — driver submits a new report (up to 5 images)
router.post(
    "/submit",
    authenticate,
    authorize(ROLES.USER),
    upload.array("images", 5),
    submitAccidentReport
);

// GET /api/accident-reports/my-reports  — driver views own reports
router.get(
    "/my-reports",
    authenticate,
    authorize(ROLES.USER),
    getMyReports
);

// ── Branch Manager Routes ────────────────────────────────────────────────────

// GET /api/accident-reports/branch/:branchId
router.get(
    "/branch/:branchId",
    authenticate,
    authorize(ROLES.BRANCHMANAGER, ROLES.OPERATIONSTAFF, ROLES.FINANCESTAFF, ROLES.OPERATIONADMIN, ROLES.COUNTRYMANAGER, ROLES.FINANCEADMIN, ROLES.ADMIN),
    getReportsByBranch
);

// ── Higher Role Routes (Country Manager / Finance Admin / Admin) ─────────────

// GET /api/accident-reports/all
router.get(
    "/all",
    authenticate,
    authorize(ROLES.COUNTRYMANAGER, ROLES.FINANCEADMIN, ROLES.OPERATIONADMIN, ROLES.ADMIN),
    getAllReports
);

// GET /api/accident-reports/:id
router.get(
    "/:id",
    authenticate,
    authorize(ROLES.BRANCHMANAGER, ROLES.COUNTRYMANAGER, ROLES.FINANCEADMIN, ROLES.OPERATIONADMIN, ROLES.ADMIN),
    getReportById
);

// PUT /api/accident-reports/:id/status
router.put(
    "/:id/status",
    authenticate,
    authorize(ROLES.BRANCHMANAGER, ROLES.COUNTRYMANAGER, ROLES.FINANCEADMIN, ROLES.OPERATIONADMIN, ROLES.ADMIN),
    updateReportStatus
);

module.exports = router;
