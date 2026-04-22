const express = require("express");
const router = express.Router();
const { getLedgerEntries } = require("../Controller/LedgerController");
const { authenticate } = require("../../../shared/middlewares/authMiddleware");
const { authorize } = require("../../../shared/middlewares/roleMiddleWare");
const { hasPermission } = require("../../../shared/middlewares/permissionMiddleware");
const { ROLES } = require("../../../shared/constants/roles");

const VIEW_ACCESS_ROLES = [
    ROLES.ADMIN,
    ROLES.FINANCEADMIN,
];

/**
 * @swagger
 * tags:
 *   name: Ledger
 *   description: Immutable Accounting Ledger APIs
 */

// ONLY GET routes. Ledger is append-only by the system via Service triggers.
/**
 * @swagger
 * /api/ledger:
 *   get:
 *     summary: Get all Ledger Entries
 *     tags: [Ledger]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of Ledger Entries
 */
router.get("/", authenticate, authorize(...VIEW_ACCESS_ROLES), hasPermission("LEDGER_VIEW"), getLedgerEntries);

module.exports = router;
