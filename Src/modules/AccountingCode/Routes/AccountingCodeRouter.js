const express = require("express");
const router = express.Router();
const {
    addAccountingCode,
    getAccountingCodes,
    getAccountingCodeById,
    updateAccountingCode,
    deleteAccountingCode,
} = require("../Controller/AccountingCodeController");
const { authenticate } = require("../../../shared/middlewares/authMiddleware");
const { authorize } = require("../../../shared/middlewares/roleMiddleWare");
const { ROLES } = require("../../../shared/constants/roles");

const AUTHORIZED_ROLES = [
    ROLES.ADMIN,
    ROLES.FINANCEADMIN,
];

/**
 * @swagger
 * tags:
 *   name: AccountingCode
 *   description: Chart of Accounts APIs
 */

router.post("/", authenticate, authorize(...AUTHORIZED_ROLES), addAccountingCode);
router.get("/", authenticate, getAccountingCodes);
router.get("/:id", authenticate, getAccountingCodeById);
router.put("/:id", authenticate, authorize(...AUTHORIZED_ROLES), updateAccountingCode);
router.delete("/:id", authenticate, authorize(...AUTHORIZED_ROLES), deleteAccountingCode);

module.exports = router;
