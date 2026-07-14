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
    "/transactions/:transactionId",
    authorize(ROLES.ADMIN, ROLES.FINANCEADMIN, ROLES.FINANCESTAFF),
    BankAccountController.getBankTransactionById
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

// Delete all transactions (specific sub-route before the general /:id)
router.delete(
    "/:id/transactions",
    authorize(ROLES.ADMIN, ROLES.FINANCEADMIN),
    BankAccountController.deleteAllTransactions
);

// Delete bank account
router.delete(
    "/:id",
    authorize(ROLES.ADMIN),
    BankAccountController.deleteBankAccount
);

// Upload statement
router.post(
    "/:id/statement",
    authorize(ROLES.ADMIN, ROLES.FINANCEADMIN, ROLES.FINANCESTAFF),
    BankAccountController.importStatement
);

// Bulk upload transactions
router.post(
    "/:id/bulk-upload",
    authorize(ROLES.ADMIN, ROLES.FINANCEADMIN),
    BankAccountController.bulkUploadTransactions
);

// Get transactions
router.get(
    "/:id/transactions",
    authorize(ROLES.ADMIN, ROLES.FINANCEADMIN, ROLES.FINANCESTAFF),
    BankAccountController.getBankTransactions
);

// Bulk delete transactions
router.post(
    "/:id/transactions/bulk-delete",
    authorize(ROLES.ADMIN, ROLES.FINANCEADMIN),
    BankAccountController.bulkDeleteTransactions
);

// Bulk edit transactions
router.post(
    "/:id/transactions/bulk-edit",
    authorize(ROLES.ADMIN, ROLES.FINANCEADMIN),
    BankAccountController.bulkEditTransactions
);

// Record manual payment
router.post(
    "/:id/manual-payment",
    authorize(ROLES.ADMIN, ROLES.FINANCEADMIN),
    upload.single("supportingDocument"),
    BankAccountController.recordManualPayment
);

module.exports = router;
