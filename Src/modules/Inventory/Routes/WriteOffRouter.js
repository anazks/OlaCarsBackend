const express = require("express");
const router = express.Router();
const {
    createWriteOff,
    getWriteOffList,
    approveWriteOff,
    rejectWriteOff
} = require("../Controller/WriteOffController");
const { authenticate } = require("../../../shared/middlewares/authMiddleware.js");
const { authorize } = require("../../../shared/middlewares/roleMiddleWare.js");
const { ROLES } = require("../../../shared/constants/roles.js");

router.post(
    "/",
    authenticate,
    authorize(ROLES.WORKSHOPSTAFF, ROLES.WORKSHOPMANAGER, ROLES.ADMIN),
    createWriteOff
);

router.get(
    "/",
    authenticate,
    authorize(ROLES.WORKSHOPSTAFF, ROLES.WORKSHOPMANAGER, ROLES.BRANCHMANAGER, ROLES.FINANCEADMIN, ROLES.ADMIN),
    getWriteOffList
);

router.put(
    "/:id/approve",
    authenticate,
    authorize(ROLES.FINANCEADMIN, ROLES.ADMIN),
    approveWriteOff
);

router.put(
    "/:id/reject",
    authenticate,
    authorize(ROLES.FINANCEADMIN, ROLES.ADMIN),
    rejectWriteOff
);

module.exports = router;
