const express = require("express");
const router = express.Router();
const {
    addVehicle,
    getVehicles,
    getVehicleById,
    progressVehicleStatus,
    uploadVehicleDocuments
} = require("../Controller/VehicleController.js");
const upload = require("../../../utils/multerConfig.js");
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

/**
 * @swagger
 * /api/vehicle/{id}/upload-documents:
 *   post:
 *     summary: Upload vehicle documents and photos to AWS S3
 *     tags: [Vehicle]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Vehicle ID
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               purchaseReceipt:
 *                 type: string
 *                 format: binary
 *               registrationCertificate:
 *                 type: string
 *                 format: binary
 *               roadTaxDisc:
 *                 type: string
 *                 format: binary
 *               numberPlateFront:
 *                 type: string
 *                 format: binary
 *               numberPlateRear:
 *                 type: string
 *                 format: binary
 *               roadworthinessCertificate:
 *                 type: string
 *                 format: binary
 *               transferOfOwnership:
 *                 type: string
 *                 format: binary
 *               policyDocument:
 *                 type: string
 *                 format: binary
 *               customsClearanceCertificate:
 *                 type: string
 *                 format: binary
 *               importPermit:
 *                 type: string
 *                 format: binary
 *               odometerPhoto:
 *                 type: string
 *                 format: binary
 *               exteriorPhotos:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *     responses:
 *       200:
 *         description: Documents uploaded successfully
 *       400:
 *         description: No documents uploaded
 *       404:
 *         description: Vehicle not found
 *       500:
 *         description: Internal server error
 */
router.post(
    "/:id/upload-documents",
    authenticate,
    authorize(
        ROLES.OPERATIONSTAFF,
        ROLES.BRANCHMANAGER,
        ROLES.FINANCESTAFF,
        ROLES.COUNTRYMANAGER,
        ROLES.ADMIN
    ),
    upload.fields([
        { name: "purchaseReceipt", maxCount: 1 },
        { name: "registrationCertificate", maxCount: 1 },
        { name: "roadTaxDisc", maxCount: 1 },
        { name: "numberPlateFront", maxCount: 1 },
        { name: "numberPlateRear", maxCount: 1 },
        { name: "roadworthinessCertificate", maxCount: 1 },
        { name: "transferOfOwnership", maxCount: 1 },
        { name: "policyDocument", maxCount: 1 },
        { name: "customsClearanceCertificate", maxCount: 1 },
        { name: "importPermit", maxCount: 1 },
        { name: "odometerPhoto", maxCount: 1 },
        { name: "exteriorPhotos", maxCount: 20 }
    ]),
    uploadVehicleDocuments
);

module.exports = router;
