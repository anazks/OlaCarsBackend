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
const { authenticate } = require("../../../shared/middlewares/authMiddleware.js");
const { authorize } = require("../../../shared/middlewares/roleMiddleWare.js");
const { ROLES } = require("../../../shared/constants/roles");
const multer = require("multer");

const router = express.Router();

const storage = multer.memoryStorage();
const upload = multer({ storage });

// Apply authentication middleware to all routes


// Only Country Manager & Branch Manager can CREATE
router.post(
    "/",
    authenticate,
    authorize(
        ROLES.COUNTRYMANAGER,
        ROLES.BRANCHMANAGER
    ),
    createInsurance
);

router.get("/eligible", authenticate, getEligibleInsurances);

router.get("/", authenticate, getAllInsurances);
router.get("/:id", authenticate, getInsuranceById);

// Update/Delete (Currently allowing same roles as create for updates, maybe admin as well)
router.put(
    "/:id",
    authenticate,
    authorize(
        ROLES.COUNTRYMANAGER,
        ROLES.BRANCHMANAGER
    ),
    updateInsurance
);

router.delete(
    "/:id",
    authenticate,
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
    authenticate,
        authorize(
        ROLES.COUNTRYMANAGER,
        ROLES.BRANCHMANAGER
    ),
    upload.single("policyDocument"),
    uploadInsuranceDocument
);

module.exports = router;
