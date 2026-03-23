const express = require("express");
const router = express.Router();
const {
    addSupplier,
    getSuppliers,
    getSupplierById,
    updateSupplier,
    deleteSupplier,
} = require("../Controller/SupplierController");
const { authenticate } = require("../../../shared/middlewares/authMiddleware");
const { authorize } = require("../../../shared/middlewares/roleMiddleWare");
const { validate } = require("../../../shared/middlewares/validate");
const { ROLES } = require("../../../shared/constants/roles");
const {
    addSupplierSchema,
    updateSupplierSchema,
    getSupplierByIdSchema,
    deleteSupplierSchema
} = require("../Validation/SupplierValidation");

const AUTHORIZED_ROLES = [
    ROLES.ADMIN,
    ROLES.OPERATIONADMIN,
    ROLES.FINANCEADMIN,
    ROLES.COUNTRYMANAGER,
    ROLES.BRANCHMANAGER
];

/**
 * @swagger
 * tags:
 *   name: Supplier
 *   description: Supplier Management APIs
 */

/**
 * @swagger
 * /api/supplier:
 *   post:
 *     summary: Create a new supplier
 *     tags: [Supplier]
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
 *             properties:
 *               name:
 *                 type: string
 *               contactPerson:
 *                 type: string
 *               email:
 *                 type: string
 *               phone:
 *                 type: string
 *               address:
 *                 type: string
 *               category:
 *                 type: string
 *                 enum: [Vehicles, Parts, Services, General]
 *               isActive:
 *                 type: boolean
 *     responses:
 *       201:
 *         description: Supplier created successfully
 */
router.post("/", authenticate, authorize(...AUTHORIZED_ROLES), validate(addSupplierSchema), addSupplier);

/**
 * @swagger
 * /api/supplier:
 *   get:
 *     summary: Get all active suppliers
 *     tags: [Supplier]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of active suppliers
 */
router.get("/", authenticate, getSuppliers);

/**
 * @swagger
 * /api/supplier/{id}:
 *   get:
 *     summary: Get a supplier by ID
 *     tags: [Supplier]
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
 *         description: Supplier details
 */
router.get("/:id", authenticate, validate(getSupplierByIdSchema), getSupplierById);

/**
 * @swagger
 * /api/supplier/{id}:
 *   put:
 *     summary: Update a supplier
 *     tags: [Supplier]
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
 *               contactPerson:
 *                 type: string
 *               email:
 *                 type: string
 *               phone:
 *                 type: string
 *               address:
 *                 type: string
 *               category:
 *                 type: string
 *                 enum: [Vehicles, Parts, Services, General]
 *               isActive:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Supplier updated successfully
 */
router.put("/:id", authenticate, authorize(...AUTHORIZED_ROLES), validate(updateSupplierSchema), updateSupplier);

/**
 * @swagger
 * /api/supplier/{id}:
 *   delete:
 *     summary: Soft delete a supplier
 *     tags: [Supplier]
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
 *         description: Supplier deleted successfully
 */
router.delete("/:id", authenticate, authorize(...AUTHORIZED_ROLES), validate(deleteSupplierSchema), deleteSupplier);

module.exports = router;
