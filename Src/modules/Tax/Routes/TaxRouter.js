const express = require("express");
const router = express.Router();
const {
    addTax,
    getTaxes,
    getTaxById,
    updateTax,
    deleteTax,
} = require("../Controller/TaxController");
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
 *   name: Tax
 *   description: Tax Profile APIs
 */

router.post("/", authenticate, authorize(...AUTHORIZED_ROLES), addTax);
router.get("/", authenticate, getTaxes);
router.get("/:id", authenticate, getTaxById);
router.put("/:id", authenticate, authorize(...AUTHORIZED_ROLES), updateTax);
router.delete("/:id", authenticate, authorize(...AUTHORIZED_ROLES), deleteTax);

module.exports = router;
