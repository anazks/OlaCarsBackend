const express = require("express");
const router = express.Router();
const ExpenseController = require("../Controller/ExpenseController");
const { authenticate } = require("../../../shared/middlewares/authMiddleware");
const { authorize } = require("../../../shared/middlewares/roleMiddleWare");
const { ROLES } = require("../../../shared/constants/roles");

router.use(authenticate);

router.post("/bulk-upload",
    authorize(ROLES.ADMIN, ROLES.FINANCEADMIN, ROLES.COUNTRYMANAGER, ROLES.BRANCHMANAGER, ROLES.FINANCESTAFF),
    ExpenseController.bulkUploadExpenses
);

router.post("/", 
    authorize(ROLES.ADMIN, ROLES.FINANCEADMIN, ROLES.COUNTRYMANAGER, ROLES.BRANCHMANAGER, ROLES.FINANCESTAFF),
    ExpenseController.createExpense
);

router.get("/", 
    authorize(ROLES.ADMIN, ROLES.FINANCEADMIN, ROLES.COUNTRYMANAGER, ROLES.BRANCHMANAGER, ROLES.FINANCESTAFF),
    ExpenseController.getAllExpenses
);

router.get("/:id", 
    authorize(ROLES.ADMIN, ROLES.FINANCEADMIN, ROLES.COUNTRYMANAGER, ROLES.BRANCHMANAGER, ROLES.FINANCESTAFF),
    ExpenseController.getExpenseById
);

router.get("/:id/pdf", 
    authorize(ROLES.ADMIN, ROLES.FINANCEADMIN, ROLES.COUNTRYMANAGER, ROLES.BRANCHMANAGER, ROLES.FINANCESTAFF),
    ExpenseController.downloadExpensePdf
);

router.put("/:id", 
    authorize(ROLES.ADMIN, ROLES.FINANCEADMIN, ROLES.COUNTRYMANAGER),
    ExpenseController.updateExpense
);

router.delete("/:id", 
    authorize(ROLES.ADMIN, ROLES.FINANCEADMIN),
    ExpenseController.deleteExpense
);

module.exports = router;
