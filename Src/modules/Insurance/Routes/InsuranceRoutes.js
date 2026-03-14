const express = require("express");
const {
    createInsurance,
    getAllInsurances,
    getEligibleInsurances,
    getInsuranceById,
    updateInsurance,
    deleteInsurance,
    uploadInsuranceDocument
} = require("../Controller/InsuranceController");
const authMiddleware = require("../../../shared/middlewares/authMiddleware");
const checkRole = require("../../../shared/middlewares/checkRole");
const { ROLES } = require("../../../shared/constants/roles");
const multer = require("multer");

const router = express.Router();

const storage = multer.memoryStorage();
const upload = multer({ storage });

// Apply authentication middleware to all routes
router.use(authMiddleware);

// Only Country Manager & Branch Manager can CREATE
router.post(
    "/",
    checkRole([
        ROLES.COUNTRYMANAGER,
        ROLES.BRANCHMANAGER
    ]),
    createInsurance
);

router.get("/eligible", getEligibleInsurances);

router.get("/", getAllInsurances);
router.get("/:id", getInsuranceById);

// Update/Delete (Currently allowing same roles as create for updates, maybe admin as well)
router.put(
    "/:id",
    checkRole([
        ROLES.COUNTRYMANAGER,
        ROLES.BRANCHMANAGER,
        ROLES.ADMIN,
        ROLES.FINANCEADMIN,
        ROLES.OPERATIONADMIN
    ]),
    updateInsurance
);

router.delete(
    "/:id",
    checkRole([
        ROLES.ADMIN,
        ROLES.COUNTRYMANAGER,
        ROLES.BRANCHMANAGER
    ]),
    deleteInsurance
);

// Upload document
router.post(
    "/:id/upload-document",
    checkRole([
        ROLES.COUNTRYMANAGER,
        ROLES.BRANCHMANAGER,
        ROLES.ADMIN,
        ROLES.FINANCEADMIN,
        ROLES.OPERATIONADMIN
    ]),
    upload.single("policyDocument"),
    uploadInsuranceDocument
);

module.exports = router;
