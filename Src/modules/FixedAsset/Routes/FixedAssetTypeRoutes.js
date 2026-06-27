const express = require("express");
const router = express.Router();
const {
    getFixedAssetTypes,
    getFixedAssetTypeById,
    addFixedAssetType,
    updateFixedAssetType,
    deleteFixedAssetType,
} = require("../Controller/FixedAssetTypeController");
const { authenticate } = require("../../../shared/middlewares/authMiddleware");
const { authorize } = require("../../../shared/middlewares/roleMiddleWare");
const { ROLES } = require("../../../shared/constants/roles");

const AUTHORIZED_ROLES = [
    ROLES.ADMIN,
    ROLES.FINANCEADMIN,
];

// All fixed asset type routes require authentication and authorization (Admin/Finance Admin)
router.use(authenticate);
router.use(authorize(...AUTHORIZED_ROLES));

router.get("/", getFixedAssetTypes);
router.get("/:id", getFixedAssetTypeById);
router.post("/", addFixedAssetType);
router.put("/:id", updateFixedAssetType);
router.delete("/:id", deleteFixedAssetType);

module.exports = router;
