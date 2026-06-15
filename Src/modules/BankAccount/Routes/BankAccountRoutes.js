const express = require("express");
const router = express.Router();
const BankAccountController = require("../Controller/BankAccountController");
const { authenticate } = require("../../../shared/middlewares/authMiddleware");
const { authorize } = require("../../../shared/middlewares/roleMiddleWare");
const { ROLES } = require("../../../shared/constants/roles");

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

router.delete(
    "/:id",
    authorize(ROLES.ADMIN),
    BankAccountController.deleteBankAccount
);

router.delete(
    "/:id/transactions",
    authorize(ROLES.ADMIN, ROLES.FINANCEADMIN),
    BankAccountController.deleteAllTransactions
);

router.post(
    "/:id/statement",
    authorize(ROLES.ADMIN, ROLES.FINANCEADMIN, ROLES.FINANCESTAFF),
    BankAccountController.uploadBankStatement
);

router.post(
    "/:id/bulk-upload",
    authorize(ROLES.ADMIN, ROLES.FINANCEADMIN),
    BankAccountController.bulkUploadTransactions
);

module.exports = router;
