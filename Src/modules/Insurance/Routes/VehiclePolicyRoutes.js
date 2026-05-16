const express = require("express");
const {
    createVehiclePolicy,
    getAllVehiclePolicies,
    getVehiclePolicyById,
    getVehiclePoliciesByVehicleId,
    updateVehiclePolicy,
    deleteVehiclePolicy
} = require("../Controller/VehiclePolicyController");
const { authenticate } = require("../../../shared/middlewares/authMiddleware.js");
const { authorize } = require("../../../shared/middlewares/roleMiddleWare.js");
const { hasPermission } = require("../../../shared/middlewares/permissionMiddleware.js");
const validate = require("../../../shared/middlewares/validate");
const { ROLES } = require("../../../shared/constants/roles");
const {
    createVehiclePolicySchema,
    updateVehiclePolicySchema,
    getVehiclePolicyByIdSchema,
    deleteVehiclePolicySchema
} = require("../Validation/VehiclePolicyValidation");
const multer = require("multer");

const router = express.Router();
const storage = multer.memoryStorage();
const upload = multer({ storage });

router.post(
    "/",
    authenticate,
    authorize(
        ROLES.ADMIN,
        ROLES.FINANCEADMIN,
        ROLES.COUNTRYMANAGER,
        ROLES.BRANCHMANAGER,
        ROLES.FINANCESTAFF
    ),
    hasPermission("INSURANCE_CREATE"),
    upload.single("certificate"),
    validate(createVehiclePolicySchema),
    createVehiclePolicy
);

router.get("/", authenticate, hasPermission("INSURANCE_VIEW"), getAllVehiclePolicies);

router.get("/vehicle/:vehicleId", authenticate, hasPermission("INSURANCE_VIEW"), getVehiclePoliciesByVehicleId);

router.get("/:id", authenticate, hasPermission("INSURANCE_VIEW"), validate(getVehiclePolicyByIdSchema), getVehiclePolicyById);

router.put(
    "/:id",
    authenticate,
    authorize(
        ROLES.ADMIN,
        ROLES.FINANCEADMIN,
        ROLES.COUNTRYMANAGER,
        ROLES.BRANCHMANAGER
    ),
    hasPermission("INSURANCE_EDIT"),
    validate(updateVehiclePolicySchema),
    updateVehiclePolicy
);

router.delete(
    "/:id",
    authenticate,
    authorize(
        ROLES.ADMIN,
        ROLES.COUNTRYMANAGER,
        ROLES.BRANCHMANAGER
    ),
    hasPermission("INSURANCE_DELETE"),
    validate(deleteVehiclePolicySchema),
    deleteVehiclePolicy
);

module.exports = router;
