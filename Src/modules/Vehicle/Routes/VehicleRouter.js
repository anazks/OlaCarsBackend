const express = require("express");
const router = express.Router();
const {
    addVehicle,
    getVehicles,
    getVehicleById,
    progressVehicleStatus,
    uploadVehicleDocuments,
    getAvailableCars,
    assignCarToDriver,
    updateVehicleLeaseSettings,
    updateMaintenanceSettings,
    updateVehicle
} = require("../Controller/VehicleController.js");
const upload = require("../../../utils/multerConfig.js");
const { authenticate } = require("../../../shared/middlewares/authMiddleware.js");
const { authorize } = require("../../../shared/middlewares/roleMiddleWare.js");
const { hasPermission } = require("../../../shared/middlewares/permissionMiddleware.js");
const validate = require("../../../shared/middlewares/validate.js");
const { ROLES } = require("../../../shared/constants/roles.js");
const {
    addVehicleSchema,
    progressVehicleSchema,
    assignCarToDriverSchema,
    getVehicleByIdSchema,
    uploadDocumentsSchema,
    updateLeaseSettingsSchema,
    updateMaintenanceSettingsSchema,
    updateVehicleSchema
} = require("../Validation/VehicleValidation");

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
    authorize(ROLES.ADMIN, ROLES.OPERATIONADMIN, ROLES.FINANCEADMIN, ROLES.BRANCHMANAGER, ROLES.COUNTRYMANAGER, ROLES.WORKSHOPMANAGER),
    hasPermission("VEHICLE_CREATE"),
    validate(addVehicleSchema),
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
    hasPermission("VEHICLE_VIEW"),
    getVehicles
);

/**
 * @swagger
 * /api/vehicle/available:
 *   get:
 *     summary: Get available vehicles for assignment
 *     tags: [Vehicle]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of available vehicles
 */
router.get(
    "/available",
    authenticate,
    authorize(ROLES.FINANCESTAFF, ROLES.BRANCHMANAGER, ROLES.ADMIN, ROLES.WORKSHOPMANAGER),
    hasPermission("VEHICLE_VIEW"),
    getAvailableCars
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
    hasPermission("VEHICLE_VIEW"),
    validate(getVehicleByIdSchema),
    getVehicleById
);

/**
 * @swagger
 * /api/vehicle/{id}:
 *   put:
 *     summary: Update vehicle generic fields
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
 *     responses:
 *       200:
 *         description: Vehicle details updated
 *       404:
 *         description: Vehicle not found
 */
router.put(
    "/:id",
    authenticate,
    authorize(ROLES.ADMIN, ROLES.OPERATIONADMIN, ROLES.BRANCHMANAGER, ROLES.COUNTRYMANAGER, ROLES.WORKSHOPMANAGER),
    hasPermission("VEHICLE_EDIT"),
    validate(updateVehicleSchema),
    updateVehicle
);

/**
 * @swagger
 * /api/vehicle/{id}/progress:
 *   put:
 *     summary: Progress vehicle onboarding status through the workflow pipeline
 *     description: |
 *       Unified workflow endpoint. Validates transition rules, role access,
 *       gate validators, applies data updates, changes status, records audit trail,
 *       and triggers side effects. See SPEC.md v3.0 for full documentation.
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
 *             properties:
 *               targetStatus:
 *                 type: string
 *                 enum:
 *                   - PENDING ENTRY
 *                   - DOCUMENTS REVIEW
 *                   - INSURANCE VERIFICATION
 *                   - INSPECTION REQUIRED
 *                   - INSPECTION FAILED
 *                   - REPAIR IN PROGRESS
 *                   - ACCOUNTING SETUP
 *                   - GPS ACTIVATION
 *                   - BRANCH MANAGER APPROVAL
 *                   - ACTIVE — AVAILABLE
 *                   - ACTIVE — RENTED
 *                   - ACTIVE — MAINTENANCE
 *                   - SUSPENDED
 *                   - TRANSFER PENDING
 *                   - TRANSFER COMPLETE
 *                   - RETIRED
 *               notes:
 *                 type: string
 *                 description: Optional transition notes (recorded in audit trail)
 *               updateData:
 *                 type: object
 *                 properties:
 *                   purchaseDetails:
 *                     type: object
 *                   basicDetails:
 *                     type: object
 *                   legalDocs:
 *                     type: object
 *                     description: Required for DOCUMENTS REVIEW (regCert, roadTax, roadworthiness)
 *                   insurancePolicy:
 *                     type: object
 *                     description: Required for INSURANCE VERIFICATION
 *                     properties:
 *                       insuranceType:
 *                         type: string
 *                         enum: [Comprehensive, Third-Party, Fleet Policy]
 *                       providerName:
 *                         type: string
 *                       policyNumber:
 *                         type: string
 *                       startDate:
 *                         type: string
 *                         format: date-time
 *                       expiryDate:
 *                         type: string
 *                         format: date-time
 *                       premiumAmount:
 *                         type: number
 *                       coverageAmount:
 *                         type: number
 *                       policyDocument:
 *                         type: string
 *                       excessAmount:
 *                         type: number
 *                       namedDrivers:
 *                         type: array
 *                         items:
 *                           type: string
 *                       claimsHistory:
 *                         type: string
 *                   importationDetails:
 *                     type: object
 *                     description: Optional, only if vehicle is imported
 *                   inspection:
 *                     type: object
 *                     description: Required for INSPECTION REQUIRED (23 items + 6 photos)
 *                   accountingSetup:
 *                     type: object
 *                     description: Required for ACCOUNTING SETUP
 *                     properties:
 *                       depreciationMethod:
 *                         type: string
 *                         enum: [Straight-Line, Reducing Balance]
 *                       usefulLifeYears:
 *                         type: number
 *                       residualValue:
 *                         type: number
 *                       isSetupComplete:
 *                         type: boolean
 *                   gpsConfiguration:
 *                     type: object
 *                     description: Required for GPS ACTIVATION
 *                     properties:
 *                       isActivated:
 *                         type: boolean
 *                       geofenceZone:
 *                         type: string
 *                       speedLimitThreshold:
 *                         type: number
 *                       idleTimeAlertMins:
 *                         type: number
 *                       mileageSyncFrequencyHrs:
 *                         type: number
 *                   suspensionDetails:
 *                     type: object
 *                     description: Required for SUSPENDED transition
 *                     properties:
 *                       reason:
 *                         type: string
 *                         enum: [Accident, Legal, Police, Dispute, Other]
 *                       suspendedUntil:
 *                         type: string
 *                         format: date-time
 *                   transferDetails:
 *                     type: object
 *                     description: Required for TRANSFER PENDING transition
 *                     properties:
 *                       toBranch:
 *                         type: string
 *                         description: Destination Branch ObjectId (required)
 *                       reason:
 *                         type: string
 *                       estimatedArrival:
 *                         type: string
 *                         format: date-time
 *                       transportMethod:
 *                         type: string
 *                         enum: [Driven, Flatbed, Shipping]
 *                   retirementDetails:
 *                     type: object
 *                     description: Required for RETIRED transition
 *                     properties:
 *                       reason:
 *                         type: string
 *                         enum: [Sold, Written Off, End of Life, Beyond Repair]
 *                       disposalDate:
 *                         type: string
 *                         format: date-time
 *                       disposalValue:
 *                         type: number
 *                   maintenanceDetails:
 *                     type: object
 *                     description: Optional for ACTIVE — MAINTENANCE transition
 *                     properties:
 *                       type:
 *                         type: string
 *                         enum: [Scheduled, Unscheduled, Emergency]
 *                       estimatedCompletionDate:
 *                         type: string
 *                         format: date-time
 *                       assignedTo:
 *                         type: string
 *     responses:
 *       200:
 *         description: Vehicle status and data updated
 *       400:
 *         description: Invalid transition, missing data, or gate validation failed
 *       403:
 *         description: Role not authorized for this transition
 *       404:
 *         description: Vehicle not found
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
        ROLES.ADMIN,
        ROLES.WORKSHOPMANAGER
    ),
    hasPermission("VEHICLE_STATUS_CHANGE"),
    validate(progressVehicleSchema),
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
 *               odometerPhoto:
 *                 type: string
 *                 format: binary
 *               exteriorPhotos:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *               interiorPhotos:
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
        ROLES.FINANCESTAFF,
        ROLES.WORKSHOPSTAFF,
        ROLES.BRANCHMANAGER,
        ROLES.COUNTRYMANAGER,
        ROLES.ADMIN,
        ROLES.WORKSHOPMANAGER
    ),
    hasPermission("VEHICLE_EDIT"),
    validate(uploadDocumentsSchema),
    upload.fields([
        { name: "purchaseReceipt", maxCount: 1 },
        { name: "registrationCertificate", maxCount: 1 },
        { name: "roadTaxDisc", maxCount: 1 },
        { name: "numberPlateFront", maxCount: 1 },
        { name: "numberPlateRear", maxCount: 1 },
        { name: "roadworthinessCertificate", maxCount: 1 },
        { name: "transferOfOwnership", maxCount: 1 },
        { name: "policyDocument", maxCount: 1 },
        { name: "insuranceCertificate", maxCount: 1 },
        { name: "odometerPhoto", maxCount: 1 },
        { name: "exteriorPhotos", maxCount: 20 },
        { name: "interiorPhotos", maxCount: 20 }
    ]),
    uploadVehicleDocuments
);

/**
 * @swagger
 * /api/vehicle/{id}/assign/{driverId}:
 *   post:
 *     summary: Assign a vehicle to a driver
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
 *       - in: path
 *         name: driverId
 *         required: true
 *         schema:
 *           type: string
 *         description: Driver ID
 *     responses:
 *       200:
 *         description: Vehicle assigned successfully
 */
router.post(
    "/:id/assign/:driverId",
    authenticate,
    authorize(ROLES.FINANCESTAFF, ROLES.BRANCHMANAGER, ROLES.ADMIN),
    hasPermission("DRIVER_ASSIGN_VEHICLE"),
    validate(assignCarToDriverSchema),
    (req, res, next) => assignCarToDriver(req, res, next)
);

/**
 * @swagger
 * /api/vehicle/{id}/lease-settings:
 *   put:
 *     summary: Update vehicle lease settings (lease duration and weekly rent)
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
 *               - durationWeeks
 *               - weeklyRent
 *             properties:
 *               durationWeeks:
 *                 type: number
 *               weeklyRent:
 *                 type: number
 *     responses:
 *       200:
 *         description: Lease settings updated successfully
 *       403:
 *         description: Unauthorized role
 *       404:
 *         description: Vehicle not found
 */
router.put(
    "/:id/lease-settings",
    authenticate,
    authorize(ROLES.FINANCEADMIN, ROLES.ADMIN),
    hasPermission("VEHICLE_EDIT"),
    validate(updateLeaseSettingsSchema),
    updateVehicleLeaseSettings
);

/**
 * @swagger
 * /api/vehicle/{id}/maintenance-settings:
 *   put:
 *     summary: Update vehicle maintenance settings (threshold)
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
 *               - maintenanceThresholdKm
 *             properties:
 *               maintenanceThresholdKm:
 *                 type: number
 *     responses:
 *       200:
 *         description: Maintenance settings updated
 */
router.put(
    "/:id/maintenance-settings",
    authenticate,
    authorize(ROLES.ADMIN, ROLES.BRANCHMANAGER, ROLES.FINANCEADMIN),
    hasPermission("VEHICLE_EDIT"),
    validate(updateMaintenanceSettingsSchema),
    updateMaintenanceSettings
);

module.exports = router;
