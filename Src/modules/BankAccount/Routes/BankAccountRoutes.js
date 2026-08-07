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

// Get ledger PDF
router.get(
    "/:id/ledger/pdf",
    authorize(ROLES.ADMIN, ROLES.FINANCEADMIN, ROLES.FINANCESTAFF),
    BankAccountController.getBankAccountLedgerPdf
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

// Dedicated Transaction Edit Routes:
// 1. Change Customer Transaction Amount
router.put(
    "/transactions/:transactionId/customer-amount",
    authorize(ROLES.ADMIN, ROLES.FINANCEADMIN),
    BankAccountController.changeCustomerTransactionAmount
);

// 2. Change Customer Contact
router.put(
    "/transactions/:transactionId/customer-contact",
    authorize(ROLES.ADMIN, ROLES.FINANCEADMIN),
    BankAccountController.changeCustomerContact
);

// 3. Change Vendor Transaction Amount
router.put(
    "/transactions/:transactionId/vendor-amount",
    authorize(ROLES.ADMIN, ROLES.FINANCEADMIN),
    BankAccountController.changeVendorTransactionAmount
);

// 4. Change Vendor Contact
router.put(
    "/transactions/:transactionId/vendor-contact",
    authorize(ROLES.ADMIN, ROLES.FINANCEADMIN),
    BankAccountController.changeVendorContact
);

// Record manual payment
router.post(
    "/:id/manual-payment",
    authorize(ROLES.ADMIN, ROLES.FINANCEADMIN),
    upload.single("supportingDocument"),
    BankAccountController.recordManualPayment
);

module.exports = router;
