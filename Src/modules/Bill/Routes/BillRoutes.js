const express = require("express");
const router = express.Router();
const BillController = require("../Controller/BillController");
const { authenticate } = require("../../../shared/middlewares/authMiddleware");
const { authorize } = require("../../../shared/middlewares/roleMiddleWare");
const { hasPermission } = require("../../../shared/middlewares/permissionMiddleware");
const { ROLES } = require("../../../shared/constants/roles");

router.use(authenticate);

router.post("/convert-po", 
    authorize(ROLES.ADMIN, ROLES.FINANCEADMIN, ROLES.OPERATIONADMIN, ROLES.COUNTRYMANAGER, ROLES.BRANCHMANAGER, ROLES.FINANCESTAFF),
    hasPermission("BILL_CREATE"), 
    BillController.createBillFromPO
);

router.post("/", 
    authorize(ROLES.ADMIN, ROLES.FINANCEADMIN, ROLES.OPERATIONADMIN, ROLES.COUNTRYMANAGER, ROLES.BRANCHMANAGER, ROLES.FINANCESTAFF),
    hasPermission("BILL_CREATE"), 
    BillController.createBill
);

router.get("/", 
    hasPermission("BILL_VIEW"), 
    BillController.getAllBills
);

router.get("/:id", 
    hasPermission("BILL_VIEW"), 
    BillController.getBillById
);

router.post("/dispose-po/:poId", 
    authorize(ROLES.ADMIN, ROLES.FINANCEADMIN, ROLES.OPERATIONADMIN),
    hasPermission("PURCHASE_ORDER_EDIT"),
    BillController.disposePO
);

router.post("/:billId/record-payment", 
    authorize(ROLES.ADMIN, ROLES.FINANCEADMIN),
    hasPermission("BILL_EDIT"),
    BillController.recordBillPayment
);

module.exports = router;
