const express = require("express");
const router = express.Router();
const voucherController = require("../Controller/VoucherController");
const { authenticate } = require("../../../shared/middlewares/authMiddleware");
const { authorize } = require("../../../shared/middlewares/roleMiddleWare");
const { ROLES } = require("../../../shared/constants/roles");

const VOUCHER_ACCESS_ROLES = [
    ROLES.ADMIN, 
    ROLES.FINANCEADMIN, 
    ROLES.FINANCESTAFF, 
    ROLES.COUNTRYMANAGER, 
    ROLES.BRANCHMANAGER
];

// All voucher routes require authentication and specific roles
router.use(authenticate);
router.use(authorize(...VOUCHER_ACCESS_ROLES));

router.route("/")
    .post(voucherController.createVoucher)
    .get(voucherController.getAllVouchers);

router.route("/:id")
    .get(voucherController.getVoucherById);

module.exports = router;
