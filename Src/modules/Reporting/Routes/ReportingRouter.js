const express = require("express");
const router = express.Router();
const ReportingController = require("../Controller/ReportingController");
const { authenticate } = require("../../../shared/middlewares/authMiddleware");
const { authorize } = require("../../../shared/middlewares/roleMiddleWare");
const { ROLES } = require("../../../shared/constants/roles");
const { hasPermission } = require("../../../shared/middlewares/permissionMiddleware");

const ACCESS_ROLES = [
    ROLES.ADMIN,
    ROLES.FINANCEADMIN,
    ROLES.COUNTRYMANAGER,
    ROLES.BRANCHMANAGER,
    ROLES.FINANCESTAFF
];


router.use(authenticate);
router.use(authorize(...ACCESS_ROLES));

router.get("/pl", hasPermission("FINANCIAL_REPORT_VIEW"), ReportingController.getPL);
router.get("/balance-sheet", hasPermission("FINANCIAL_REPORT_VIEW"), ReportingController.getBalanceSheet);
router.get("/daily-finance", hasPermission("FINANCIAL_REPORT_VIEW"), ReportingController.getDailyFinance);
router.get("/driver-performance", hasPermission("DRIVER_VIEW"), ReportingController.getDriverPerformance);
router.get("/staff-performance", hasPermission("STAFF_PERFORMANCE_VIEW"), ReportingController.getStaffPerformance);

module.exports = router;
