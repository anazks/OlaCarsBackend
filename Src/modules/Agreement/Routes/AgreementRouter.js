const express = require("express");
const AgreementController = require("../Controller/AgreementController");
const { authorize } = require("../../../shared/middlewares/roleMiddleWare.js");
const { authenticate } = require("../../../shared/middlewares/authMiddleware.js");
const { ROLES } = require("../../../shared/constants/roles.js");

const router = express.Router();

// Public routes (if needed to display on customer side without authentication)
router.get("/", AgreementController.getAllAgreements);
router.get("/:id", AgreementController.getAgreementById);

// Protected routes
router.use(authenticate);
// Allowed roles for managing agreements: ADMIN, OPERATIONADMIN, COUNTRYMANAGER
router.use(authorize(ROLES.ADMIN, ROLES.OPERATIONADMIN, ROLES.COUNTRYMANAGER));

router.post("/", AgreementController.createAgreement);
router.put("/:id", AgreementController.updateAgreement);
router.get("/:id/versions", AgreementController.getAgreementVersions);

module.exports = router;
