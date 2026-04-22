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
const { hasPermission } = require("../../../shared/middlewares/permissionMiddleware");
const validate = require("../../../shared/middlewares/validate");
const { ROLES } = require("../../../shared/constants/roles");
const {
    addTaxSchema,
    updateTaxSchema,
    getTaxByIdSchema,
    deleteTaxSchema
} = require("../Validation/TaxValidation");

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

/**
 * @swagger
 * /api/tax:
 *   post:
 *     summary: Create new Tax Profile
 *     tags: [Tax]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - rate
 *             properties:
 *               name:
 *                 type: string
 *               rate:
 *                 type: number
 *               isActive:
 *                 type: boolean
 *     responses:
 *       201:
 *         description: Tax Profile created successfully
 */
router.post("/", authenticate, authorize(...AUTHORIZED_ROLES), hasPermission("TAX_CREATE"), validate(addTaxSchema), addTax);

/**
 * @swagger
 * /api/tax:
 *   get:
 *     summary: Get all Tax Profiles
 *     tags: [Tax]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of Tax Profiles
 */
router.get("/", authenticate, hasPermission("TAX_VIEW"), getTaxes);

/**
 * @swagger
 * /api/tax/{id}:
 *   get:
 *     summary: Get Tax Profile by ID
 *     tags: [Tax]
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
 *         description: Tax Profile details
 */
router.get("/:id", authenticate, hasPermission("TAX_VIEW"), validate(getTaxByIdSchema), getTaxById);

/**
 * @swagger
 * /api/tax/{id}:
 *   put:
 *     summary: Update a Tax Profile
 *     tags: [Tax]
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
 *               name:
 *                 type: string
 *               rate:
 *                 type: number
 *               isActive:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Tax Profile updated successfully
 */
router.put("/:id", authenticate, authorize(...AUTHORIZED_ROLES), hasPermission("TAX_EDIT"), validate(updateTaxSchema), updateTax);

/**
 * @swagger
 * /api/tax/{id}:
 *   delete:
 *     summary: Soft Delete a Tax Profile
 *     tags: [Tax]
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
 *         description: Tax Profile deleted successfully
 */
router.delete("/:id", authenticate, authorize(...AUTHORIZED_ROLES), hasPermission("TAX_DELETE"), validate(deleteTaxSchema), deleteTax);

module.exports = router;
