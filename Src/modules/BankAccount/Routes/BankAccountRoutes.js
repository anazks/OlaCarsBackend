const express = require("express");
const router = express.Router();
const BankAccountController = require("../Controller/BankAccountController");
const { authenticate } = require("../../../shared/middlewares/authMiddleware");
const { authorize } = require("../../../shared/middlewares/roleMiddleWare");
const { ROLES } = require("../../../shared/constants/roles");

const upload = require("../../../utils/multerConfig");

router.use(authenticate);

router.post(
    "/",
    authorize(ROLES.ADMIN, ROLES.FINANCEADMIN),
    BankAccountController.createBankAccount
);

router.get(
    "/",
    authorize(ROLES.ADMIN, ROLES.FINANCEADMIN, ROLES.FINANCESTAFF),
    BankAccountController.getBankAccounts
);

router.get(
    "/:id",
    authorize(ROLES.ADMIN, ROLES.FINANCEADMIN, ROLES.FINANCESTAFF),
    BankAccountController.getBankAccount
);

router.put(
    "/:id",
    authorize(ROLES.ADMIN, ROLES.FINANCEADMIN),
    BankAccountController.updateBankAccount
);

// ⚠️ Must be before DELETE /:id to avoid route collision
router.delete(
    "/:id/transactions",
    authorize(ROLES.ADMIN),
    BankAccountController.deleteAllTransactions
);

router.delete(
    "/:id",
    authorize(ROLES.ADMIN),
    BankAccountController.deleteBankAccount
);

router.post(
    "/:id/statement",
    authorize(ROLES.ADMIN, ROLES.FINANCEADMIN),
    BankAccountController.importStatement
);

router.post(
    "/:id/manual-payment",
    authorize(ROLES.ADMIN, ROLES.FINANCEADMIN),
    upload.single("supportingDocument"),
    BankAccountController.recordManualPayment
);

module.exports = router;
