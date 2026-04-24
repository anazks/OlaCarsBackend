const express = require("express");
const router = express.Router();
const { authenticate } = require("../../../shared/middlewares/authMiddleware");
const { authorize } = require("../../../shared/middlewares/roleMiddleWare");
const { hasPermission } = require("../../../shared/middlewares/permissionMiddleware");
const { ROLES } = require("../../../shared/constants/roles");
const { 
    getActiveAlerts, 
    getAllAlerts,
    resolveAlert,
    runManualInsuranceCheck
} = require("../Controller/AlertController");

// Get all alerts (including resolved)
router.get(
    "/all",
    authenticate,
    authorize(
        ROLES.ADMIN, 
        ROLES.COUNTRYMANAGER, 
        ROLES.BRANCHMANAGER, 
        ROLES.WORKSHOPMANAGER,
        ROLES.OPERATIONADMIN, 
        ROLES.OPERATIONSTAFF
    ),
    getAllAlerts
);

// Get all active alerts
router.get(
    "/",
    authenticate,
    authorize(
        ROLES.ADMIN, 
        ROLES.COUNTRYMANAGER, 
        ROLES.BRANCHMANAGER, 
        ROLES.WORKSHOPMANAGER,
        ROLES.OPERATIONADMIN, 
        ROLES.OPERATIONSTAFF
    ),
    getActiveAlerts
);

// Resolve an alert
router.put(
    "/:id/resolve",
    authenticate,
    authorize(
        ROLES.ADMIN, 
        ROLES.COUNTRYMANAGER, 
        ROLES.BRANCHMANAGER, 
        ROLES.WORKSHOPMANAGER,
        ROLES.OPERATIONADMIN
    ),
    resolveAlert
);

// Manual trigger for insurance check
router.post(
    "/check-insurance",
    authenticate,
    authorize(ROLES.ADMIN, ROLES.COUNTRYMANAGER),
    runManualInsuranceCheck
);

module.exports = router;
