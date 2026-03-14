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
const { authorize } = require("../../../shared/middlewares/roleMiddleWare.js");
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
    authorize(
        ROLES.COUNTRYMANAGER,
        ROLES.BRANCHMANAGER
    ),
    createInsurance
);

router.get("/eligible", getEligibleInsurances);

router.get("/", getAllInsurances);
router.get("/:id", getInsuranceById);

// Update/Delete (Currently allowing same roles as create for updates, maybe admin as well)
router.put(
    "/:id",
    authorize(
        ROLES.COUNTRYMANAGER,
        ROLES.BRANCHMANAGER
    ),
    updateInsurance
);

router.delete(
    "/:id",
    authorize(
        ROLES.ADMIN,
        ROLES.COUNTRYMANAGER,
        ROLES.BRANCHMANAGER
    ),
    deleteInsurance
);

// Upload document
router.post(
    "/:id/upload-document",
    authorize(
        ROLES.COUNTRYMANAGER,
        ROLES.BRANCHMANAGER
    ),
    upload.single("policyDocument"),
    uploadInsuranceDocument
);

module.exports = router;
