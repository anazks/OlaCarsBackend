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
const { ROLES } = require("../../../shared/constants/roles");

const AUTHORIZED_ROLES = [
    ROLES.ADMIN,
    ROLES.OPERATIONADMIN,
    ROLES.FINANCEADMIN,
    ROLES.COUNTRYMANAGER
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
 */
router.post("/", authenticate, authorize(...AUTHORIZED_ROLES), addSupplier);

/**
 * @swagger
 * /api/supplier:
 *   get:
 *     summary: Get all active suppliers
 *     tags: [Supplier]
 *     security:
 *       - bearerAuth: []
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
 */
router.get("/:id", authenticate, getSupplierById);

/**
 * @swagger
 * /api/supplier/{id}:
 *   put:
 *     summary: Update a supplier
 *     tags: [Supplier]
 *     security:
 *       - bearerAuth: []
 */
router.put("/:id", authenticate, authorize(...AUTHORIZED_ROLES), updateSupplier);

/**
 * @swagger
 * /api/supplier/{id}:
 *   delete:
 *     summary: Soft delete a supplier
 *     tags: [Supplier]
 *     security:
 *       - bearerAuth: []
 */
router.delete("/:id", authenticate, authorize(...AUTHORIZED_ROLES), deleteSupplier);

module.exports = router;
