const express = require("express");
const router = express.Router();
console.log("[DEBUG] WorkshopProcurementRouter loaded");
const {
    createRequest,
    getRequests,
    approveRequest
} = require("../Controller/WorkshopProcurementController.js");
const { authenticate } = require("../../../shared/middlewares/authMiddleware.js");
const { authorize } = require("../../../shared/middlewares/roleMiddleWare.js");
const { ROLES } = require("../../../shared/constants/roles.js");

router.post(
    "/",
    authenticate,
    authorize(ROLES.WORKSHOPSTAFF, ROLES.WORKSHOPMANAGER, ROLES.ADMIN),
    createRequest
);

router.get(
    "/",
    authenticate,
    authorize(ROLES.WORKSHOPSTAFF, ROLES.WORKSHOPMANAGER, ROLES.BRANCHMANAGER, ROLES.ADMIN),
    getRequests
);

router.put(
    "/:id/approve",
    authenticate,
    authorize(ROLES.WORKSHOPMANAGER, ROLES.BRANCHMANAGER, ROLES.ADMIN),
    approveRequest
);

module.exports = router;
