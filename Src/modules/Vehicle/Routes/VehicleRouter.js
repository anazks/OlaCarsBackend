const express = require("express");
const router = express.Router();
const {
    addVehicle,
    getVehicles,
    getVehicleById,
    progressVehicleStatus,
} = require("../Controller/VehicleController.js");
const { authenticate } = require("../../../shared/middlewares/authMiddleware.js");
const { authorize } = require("../../../shared/middlewares/roleMiddleWare.js");
const { ROLES } = require("../../../shared/constants/roles.js");

/**
 * @swagger
 * tags:
 *   name: Vehicle
 *   description: Vehicle Onboarding & Management APIs
 */

/**
 * @swagger
 * /api/vehicle:
 *   post:
 *     summary: Initiate a new vehicle onboarding record (PENDING ENTRY)
 *     tags: [Vehicle]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       201:
 *         description: Vehicle initiated
 */
router.post(
    "/",
    authenticate,
    authorize(ROLES.OPERATIONSTAFF, ROLES.BRANCHMANAGER, ROLES.FINANCESTAFF, ROLES.COUNTRYMANAGER, ROLES.ADMIN),
    addVehicle
);

/**
 * @swagger
 * /api/vehicle:
 *   get:
 *     summary: Get all vehicles
 *     tags: [Vehicle]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of vehicles
 */
router.get(
    "/",
    authenticate,
    getVehicles
);

/**
 * @swagger
 * /api/vehicle/{id}:
 *   get:
 *     summary: Get a single vehicle by ID
 *     tags: [Vehicle]
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
 *         description: Vehicle details
 */
router.get(
    "/:id",
    authenticate,
    getVehicleById
);

/**
 * @swagger
 * /api/vehicle/{id}/progress:
 *   put:
 *     summary: Progress vehicle onboarding status
 *     tags: [Vehicle]
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
 *               - updateData
 *             properties:
 *               targetStatus:
 *                 type: string
 *               updateData:
 *                 type: object
 *     responses:
 *       200:
 *         description: Vehicle status and data updated
 */
router.put(
    "/:id/progress",
    authenticate,
    authorize(
        ROLES.OPERATIONSTAFF,
        ROLES.FINANCESTAFF,
        ROLES.WORKSHOPSTAFF,
        ROLES.BRANCHMANAGER,
        ROLES.COUNTRYMANAGER,
        ROLES.ADMIN
    ),
    progressVehicleStatus
);

module.exports = router;
