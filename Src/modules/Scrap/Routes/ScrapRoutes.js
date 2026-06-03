const express = require("express");
const router = express.Router();
const { createScrap, getScrapList, updateScrap, deleteScrap } = require("../Controller/ScrapController");
const { authenticate } = require("../../../shared/middlewares/authMiddleware");
const { authorize } = require("../../../shared/middlewares/roleMiddleWare");
const { ROLES } = require("../../../shared/constants/roles");

router.post(
    "/",
    authenticate,
    authorize(ROLES.WORKSHOPSTAFF, ROLES.WORKSHOPMANAGER, ROLES.ADMIN),
    createScrap
);

router.get(
    "/",
    authenticate,
    authorize(ROLES.WORKSHOPSTAFF, ROLES.WORKSHOPMANAGER, ROLES.BRANCHMANAGER, ROLES.FINANCEADMIN, ROLES.ADMIN),
    getScrapList
);

router.put(
    "/:id",
    authenticate,
    authorize(ROLES.WORKSHOPSTAFF, ROLES.WORKSHOPMANAGER, ROLES.FINANCEADMIN, ROLES.ADMIN),
    updateScrap
);

router.delete(
    "/:id",
    authenticate,
    authorize(ROLES.FINANCEADMIN, ROLES.ADMIN),
    deleteScrap
);

module.exports = router;
