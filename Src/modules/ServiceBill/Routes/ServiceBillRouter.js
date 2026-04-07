const express = require("express");
const router = express.Router();
const {
    generateBillHandler,
    getBillsHandler,
    getBillByIdHandler,
    approveBillHandler,
    markPaidHandler,
    voidBillHandler,
} = require("../Controller/ServiceBillController");
const { authenticate } = require("../../../shared/middlewares/authMiddleware.js");
const { authorize } = require("../../../shared/middlewares/roleMiddleWare.js");
const { ROLES } = require("../../../shared/constants/roles.js");

/**
 * @swagger
 * tags:
 *   name: ServiceBill
 *   description: Service Bill & Billing APIs
 */

/**
 * @swagger
 * /api/service-bills:
 *   post:
 *     summary: Generate a bill from a completed work order
 *     tags: [ServiceBill]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - workOrderId
 *             properties:
 *               workOrderId:
 *                 type: string
 *               taxRate:
 *                 type: number
 *                 description: Tax percentage (e.g. 15 for 15%)
 *               hourlyRate:
 *                 type: number
 *                 description: Labour hourly rate (default 50)
 *               discount:
 *                 type: number
 *               notes:
 *                 type: string
 *     responses:
 *       201:
 *         description: Bill generated
 *       400:
 *         description: WO not in billable state
 */
router.post(
    "/",
    authenticate,
    authorize(ROLES.FINANCESTAFF, ROLES.FINANCEADMIN, ROLES.BRANCHMANAGER, ROLES.ADMIN, ROLES.WORKSHOPMANAGER, ROLES.WORKSHOPSTAFF),
    generateBillHandler
);

/**
 * @swagger
 * /api/service-bills:
 *   get:
 *     summary: Get all service bills
 *     tags: [ServiceBill]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *       - in: query
 *         name: branchId
 *         schema:
 *           type: string
 *       - in: query
 *         name: workOrderId
 *         schema:
 *           type: string
 *       - in: query
 *         name: paymentStatus
 *         schema:
 *           type: string
 *           enum: [UNPAID, PARTIAL, PAID]
 *     responses:
 *       200:
 *         description: List of bills
 */
router.get("/", authenticate, getBillsHandler);

/**
 * @swagger
 * /api/service-bills/{id}:
 *   get:
 *     summary: Get a single bill by ID
 *     tags: [ServiceBill]
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
 *         description: Bill details
 *       404:
 *         description: Not found
 */
router.get("/:id", authenticate, getBillByIdHandler);

/**
 * @swagger
 * /api/service-bills/{id}/approve:
 *   put:
 *     summary: Approve a service bill
 *     tags: [ServiceBill]
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
 *         description: Bill approved
 */
router.put(
    "/:id/approve",
    authenticate,
    authorize(ROLES.FINANCEADMIN, ROLES.BRANCHMANAGER, ROLES.ADMIN, ROLES.WORKSHOPMANAGER, ROLES.WORKSHOPSTAFF),
    approveBillHandler
);

/**
 * @swagger
 * /api/service-bills/{id}/pay:
 *   put:
 *     summary: Mark a bill as paid
 *     tags: [ServiceBill]
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
 *               paymentMethod:
 *                 type: string
 *                 enum: [Cash, Bank Transfer, Credit Card, Insurance, Internal]
 *               paymentReference:
 *                 type: string
 *     responses:
 *       200:
 *         description: Bill marked as paid
 */
router.put(
    "/:id/pay",
    authenticate,
    authorize(ROLES.FINANCESTAFF, ROLES.FINANCEADMIN, ROLES.ADMIN, ROLES.WORKSHOPMANAGER, ROLES.WORKSHOPSTAFF),
    markPaidHandler
);

/**
 * @swagger
 * /api/service-bills/{id}/void:
 *   put:
 *     summary: Void a service bill
 *     tags: [ServiceBill]
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
 *             required:
 *               - reason
 *             properties:
 *               reason:
 *                 type: string
 *     responses:
 *       200:
 *         description: Bill voided
 */
router.put(
    "/:id/void",
    authenticate,
    authorize(ROLES.FINANCEADMIN, ROLES.ADMIN),
    voidBillHandler
);

module.exports = router;
