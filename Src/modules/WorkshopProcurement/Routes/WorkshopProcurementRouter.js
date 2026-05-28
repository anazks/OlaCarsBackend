const express = require("express");
const router = express.Router();
console.log("[DEBUG] WorkshopProcurementRouter loaded");
const {
    createRequest,
    getRequests,
    approveRequest,
    getRequestById
} = require("../Controller/WorkshopProcurementController.js");
const { authenticate } = require("../../../shared/middlewares/authMiddleware.js");
const { authorize } = require("../../../shared/middlewares/roleMiddleWare.js");
const { ROLES } = require("../../../shared/constants/roles.js");

router.post(
    "/",
    authenticate,
    authorize(ROLES.WORKSHOPSTAFF, ROLES.WORKSHOPMANAGER, ROLES.MERCHENDISE, ROLES.ADMIN),
    createRequest
);

router.get(
    "/",
    authenticate,
    authorize(ROLES.WORKSHOPSTAFF, ROLES.WORKSHOPMANAGER, ROLES.BRANCHMANAGER, ROLES.FINANCEADMIN, ROLES.MERCHENDISE, ROLES.ADMIN),
    getRequests
);

router.get(
    "/:id",
    authenticate,
    authorize(ROLES.WORKSHOPSTAFF, ROLES.WORKSHOPMANAGER, ROLES.BRANCHMANAGER, ROLES.FINANCEADMIN, ROLES.MERCHENDISE, ROLES.ADMIN),
    getRequestById
);

router.put(
    "/:id/approve",
    authenticate,
    authorize(ROLES.WORKSHOPMANAGER, ROLES.BRANCHMANAGER, ROLES.MERCHENDISE, ROLES.ADMIN),
    approveRequest
);

module.exports = router;
