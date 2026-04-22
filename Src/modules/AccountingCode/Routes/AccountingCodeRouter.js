const express = require("express");
const router = express.Router();
const {
    addAccountingCode,
    getAccountingCodes,
    getAccountingCodeById,
    updateAccountingCode,
    deleteAccountingCode,
} = require("../Controller/AccountingCodeController");
const { authenticate } = require("../../../shared/middlewares/authMiddleware");
const { authorize } = require("../../../shared/middlewares/roleMiddleWare");
const { hasPermission } = require("../../../shared/middlewares/permissionMiddleware");
const { ROLES } = require("../../../shared/constants/roles");

const AUTHORIZED_ROLES = [
    ROLES.ADMIN,
    ROLES.FINANCEADMIN,
];

/**
 * @swagger
 * tags:
 *   name: AccountingCode
 *   description: Chart of Accounts APIs
 */

/**
 * @swagger
 * /api/accounting-code:
 *   post:
 *     summary: Create new Accounting Code
 *     tags: [AccountingCode]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - code
 *               - name
 *               - category
 *             properties:
 *               code:
 *                 type: string
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               category:
 *                 type: string
 *                 enum: [INCOME, EXPENSE, LIABILITY, ASSET, EQUITY]
 *               isActive:
 *                 type: boolean
 *     responses:
 *       201:
 *         description: Accounting Code created successfully
 */
router.post("/", authenticate, authorize(...AUTHORIZED_ROLES), hasPermission("ACCOUNTING_CODE_CREATE"), addAccountingCode);

/**
 * @swagger
 * /api/accounting-code:
 *   get:
 *     summary: Get all Accounting Codes
 *     tags: [AccountingCode]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of Accounting Codes
 */
router.get("/", authenticate, hasPermission("ACCOUNTING_CODE_VIEW"), getAccountingCodes);

/**
 * @swagger
 * /api/accounting-code/{id}:
 *   get:
 *     summary: Get Accounting Code by ID
 *     tags: [AccountingCode]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Accounting Code details
 */
router.get("/:id", authenticate, hasPermission("ACCOUNTING_CODE_VIEW"), getAccountingCodeById);

/**
 * @swagger
 * /api/accounting-code/{id}:
 *   put:
 *     summary: Update an Accounting Code
 *     tags: [AccountingCode]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               code:
 *                 type: string
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               category:
 *                 type: string
 *                 enum: [INCOME, EXPENSE, LIABILITY, ASSET, EQUITY]
 *               isActive:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Accounting Code updated successfully
 */
router.put("/:id", authenticate, authorize(...AUTHORIZED_ROLES), hasPermission("ACCOUNTING_CODE_EDIT"), updateAccountingCode);

/**
 * @swagger
 * /api/accounting-code/{id}:
 *   delete:
 *     summary: Delete an Accounting Code
 *     tags: [AccountingCode]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Accounting Code deleted successfully
 */
router.delete("/:id", authenticate, authorize(...AUTHORIZED_ROLES), hasPermission("ACCOUNTING_CODE_DELETE"), deleteAccountingCode);

module.exports = router;
