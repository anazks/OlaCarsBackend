const express = require("express");
const router = express.Router();
const SalaryController = require("../Controller/SalaryController");
const { authenticate } = require("../../../shared/middlewares/authMiddleware");
const { authorize } = require("../../../shared/middlewares/roleMiddleWare");
const { ROLES } = require("../../../shared/constants/roles");

const ADMIN_ROLES = [ROLES.ADMIN, ROLES.FINANCEADMIN];

router.use(authenticate);
router.use(authorize(...ADMIN_ROLES));

router.get("/structures", SalaryController.getSalaryStructures);
router.post("/structures", SalaryController.updateSalaryStructure);
router.post("/process", SalaryController.processPayroll);

module.exports = router;
