const express = require("express");
const router = express.Router();
const {
    getFixedAssets,
    getFixedAssetById,
    addFixedAsset,
    updateFixedAsset,
    deleteFixedAsset,
    previewDepreciationSchedule,
    postDepreciation
} = require("../Controller/FixedAssetController");
const { authenticate } = require("../../../shared/middlewares/authMiddleware");
const { authorize } = require("../../../shared/middlewares/roleMiddleWare");
const { ROLES } = require("../../../shared/constants/roles");

const AUTHORIZED_ROLES = [
    ROLES.ADMIN,
    ROLES.FINANCEADMIN,
];

// All fixed asset routes require authentication and authorization (Admin/Finance Admin)
router.use(authenticate);
router.use(authorize(...AUTHORIZED_ROLES));

router.get("/", getFixedAssets);
router.get("/:id", getFixedAssetById);
router.post("/", addFixedAsset);
router.put("/:id", updateFixedAsset);
router.delete("/:id", deleteFixedAsset);
router.post("/calculate-depreciation-schedule", previewDepreciationSchedule);
router.post("/:id/post-depreciation", postDepreciation);

module.exports = router;
