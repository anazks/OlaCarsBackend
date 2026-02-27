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
 *             properties:
 *               status:
 *                 type: string
 *               purchaseDetails:
 *                 type: object
 *                 properties:
 *                   purchaseOrder:
 *                     type: string
 *                   vendorName:
 *                     type: string
 *                   purchaseDate:
 *                     type: string
 *                     format: date-time
 *                   purchasePrice:
 *                     type: number
 *                   currency:
 *                     type: string
 *                   paymentMethod:
 *                     type: string
 *                     enum: [Cash, Bank Transfer, Finance]
 *                   financeDetails:
 *                     type: object
 *                     properties:
 *                       lenderName:
 *                         type: string
 *                       loanAmount:
 *                         type: number
 *                       termMonths:
 *                         type: number
 *                       monthlyInstalment:
 *                         type: number
 *                   branch:
 *                     type: string
 *                   purchaseReceipt:
 *                     type: string
 *               basicDetails:
 *                 type: object
 *                 properties:
 *                   make:
 *                     type: string
 *                   model:
 *                     type: string
 *                   year:
 *                     type: number
 *                   category:
 *                     type: string
 *                     enum: [Sedan, SUV, Pickup, Van, Luxury, Commercial]
 *                   fuelType:
 *                     type: string
 *                     enum: [Petrol, Diesel, Hybrid, Electric]
 *                   transmission:
 *                     type: string
 *                     enum: [Automatic, Manual]
 *                   engineCapacity:
 *                     type: number
 *                   colour:
 *                     type: string
 *                   seats:
 *                     type: number
 *                   vin:
 *                     type: string
 *                   engineNumber:
 *                     type: string
 *                   bodyType:
 *                     type: string
 *                     enum: [Hatchback, Saloon, Coupe, Convertible, Truck]
 *                   odometer:
 *                     type: number
 *                   gpsSerialNumber:
 *                     type: string
 *               legalDocs:
 *                 type: object
 *               insurancePolicy:
 *                 type: object
 *               importationDetails:
 *                 type: object
 *               inspection:
 *                 type: object
 *               accountingSetup:
 *                 type: object
 *               gpsConfiguration:
 *                 type: object
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
 *                 properties:
 *                   status:
 *                     type: string
 *                   purchaseDetails:
 *                     type: object
 *                   basicDetails:
 *                     type: object
 *                   legalDocs:
 *                     type: object
 *                   insurancePolicy:
 *                     type: object
 *                   importationDetails:
 *                     type: object
 *                   inspection:
 *                     type: object
 *                   accountingSetup:
 *                     type: object
 *                   gpsConfiguration:
 *                     type: object
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
