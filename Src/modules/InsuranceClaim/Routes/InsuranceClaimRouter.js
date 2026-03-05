const express = require("express");
const router = express.Router();
const {
    createClaimHandler,
    getClaimsHandler,
    getClaimByIdHandler,
    progressClaimHandler,
} = require("../Controller/InsuranceClaimController");
const { authenticate } = require("../../../shared/middlewares/authMiddleware.js");
const { authorize } = require("../../../shared/middlewares/roleMiddleWare.js");
const { ROLES } = require("../../../shared/constants/roles.js");

/**
 * @swagger
 * tags:
 *   name: InsuranceClaim
 *   description: Insurance Claim Management APIs
 */

/**
 * @swagger
 * /api/insurance-claims:
 *   post:
 *     summary: Create an insurance claim from an ACCIDENT work order
 *     description: Auto-populates insurer and policy details from the vehicle's insurance data.
 *     tags: [InsuranceClaim]
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
 *               - incidentDate
 *               - incidentDescription
 *               - claimAmount
 *             properties:
 *               workOrderId:
 *                 type: string
 *               incidentDate:
 *                 type: string
 *                 format: date-time
 *               incidentDescription:
 *                 type: string
 *               incidentLocation:
 *                 type: string
 *               policeReportNumber:
 *                 type: string
 *               claimAmount:
 *                 type: number
 *               excessAmount:
 *                 type: number
 *               notes:
 *                 type: string
 *     responses:
 *       201:
 *         description: Claim created
 *       400:
 *         description: WO is not ACCIDENT type
 */
router.post(
    "/",
    authenticate,
    authorize(ROLES.FINANCESTAFF, ROLES.OPERATIONSTAFF, ROLES.BRANCHMANAGER, ROLES.FINANCEADMIN, ROLES.ADMIN),
    createClaimHandler
);

/**
 * @swagger
 * /api/insurance-claims:
 *   get:
 *     summary: Get all insurance claims
 *     tags: [InsuranceClaim]
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
 *         name: vehicleId
 *         schema:
 *           type: string
 *       - in: query
 *         name: workOrderId
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of claims
 */
router.get("/", authenticate, getClaimsHandler);

/**
 * @swagger
 * /api/insurance-claims/{id}:
 *   get:
 *     summary: Get a single claim by ID
 *     tags: [InsuranceClaim]
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
 *         description: Claim details
 *       404:
 *         description: Not found
 */
router.get("/:id", authenticate, getClaimByIdHandler);

/**
 * @swagger
 * /api/insurance-claims/{id}/progress:
 *   put:
 *     summary: Progress a claim through the state machine
 *     description: |
 *       Transitions: DRAFT → SUBMITTED → UNDER_REVIEW → APPROVED/REJECTED → PAYMENT_RECEIVED → CLOSED
 *     tags: [InsuranceClaim]
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
 *               - targetStatus
 *             properties:
 *               targetStatus:
 *                 type: string
 *                 enum: [SUBMITTED, UNDER_REVIEW, APPROVED, REJECTED, PAYMENT_RECEIVED, CLOSED]
 *               approvedAmount:
 *                 type: number
 *               rejectionReason:
 *                 type: string
 *               paymentReference:
 *                 type: string
 *               paymentAmount:
 *                 type: number
 *               insurerNotes:
 *                 type: string
 *               notes:
 *                 type: string
 *     responses:
 *       200:
 *         description: Claim status updated
 *       400:
 *         description: Invalid transition or missing data
 */
router.put(
    "/:id/progress",
    authenticate,
    authorize(ROLES.FINANCESTAFF, ROLES.OPERATIONSTAFF, ROLES.BRANCHMANAGER, ROLES.FINANCEADMIN, ROLES.ADMIN),
    progressClaimHandler
);

module.exports = router;
