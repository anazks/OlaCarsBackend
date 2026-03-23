const express = require("express");
const {
    createInsurance,
    getAllInsurances,
    getEligibleInsurances,
    getInsuranceById,
    updateInsurance,
    deleteInsurance,
    uploadInsuranceDocument
} = require("../Controller/InsuranceController");
const { authenticate } = require("../../../shared/middlewares/authMiddleware.js");
const { authorize } = require("../../../shared/middlewares/roleMiddleWare.js");
const validate = require("../../../shared/middlewares/validate");
const { ROLES } = require("../../../shared/constants/roles");
const {
    createInsuranceSchema,
    updateInsuranceSchema,
    getInsuranceByIdSchema,
    deleteInsuranceSchema,
    uploadDocumentSchema
} = require("../Validation/InsuranceValidation");
const multer = require("multer");

const router = express.Router();

const storage = multer.memoryStorage();
const upload = multer({ storage });

/**
 * @swagger
 * tags:
 *   name: Insurance
 *   description: Insurance Policy Management APIs
 */

/**
 * @swagger
 * /api/insurance:
 *   post:
 *     summary: Create new insurance policy
 *     tags: [Insurance]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - provider
 *               - policyNumber
 *               - startDate
 *               - expiryDate
 *             properties:
 *               provider:
 *                 type: string
 *               policyNumber:
 *                 type: string
 *               policyType:
 *                 type: string
 *                 enum: [FLEET, INDIVIDUAL]
 *               coverageType:
 *                 type: string
 *                 enum: [THIRD_PARTY, COMPREHENSIVE]
 *               startDate:
 *                 type: string
 *                 format: date
 *               expiryDate:
 *                 type: string
 *                 format: date
 *               insuredValue:
 *                 type: number
 *               policyDocument:
 *                 type: string
 *                 format: binary
 *     responses:
 *       201:
 *         description: Insurance created successfully
 */
router.post(
    "/",
    authenticate,
    authorize(
        ROLES.COUNTRYMANAGER,
        ROLES.BRANCHMANAGER,
        ROLES.FINANCESTAFF
    ),
    upload.single("policyDocument"),
    validate(createInsuranceSchema),
    createInsurance
);

/**
 * @swagger
 * /api/insurance/eligible:
 *   get:
 *     summary: Get active insurance policies for vehicle onboarding
 *     tags: [Insurance]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of active insurance policies
 */
router.get("/eligible", authenticate, getEligibleInsurances);

/**
 * @swagger
 * /api/insurance:
 *   get:
 *     summary: Get all insurance policies (role-filtered by country)
 *     tags: [Insurance]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of insurance policies
 */
router.get("/", authenticate, getAllInsurances);

/**
 * @swagger
 * /api/insurance/{id}:
 *   get:
 *     summary: Get insurance by ID
 *     tags: [Insurance]
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
 *         description: Insurance details
 */
router.get("/:id", authenticate, validate(getInsuranceByIdSchema), getInsuranceById);

/**
 * @swagger
 * /api/insurance/{id}:
 *   put:
 *     summary: Update insurance policy
 *     tags: [Insurance]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Insurance updated successfully
 */
router.put(
    "/:id",
    authenticate,
    authorize(
        ROLES.COUNTRYMANAGER,
        ROLES.BRANCHMANAGER
    ),
    validate(updateInsuranceSchema),
    updateInsurance
);

/**
 * @swagger
 * /api/insurance/{id}:
 *   delete:
 *     summary: Delete insurance policy
 *     tags: [Insurance]
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
 *         description: Insurance deleted successfully
 */
router.delete(
    "/:id",
    authenticate,
    authorize(
        ROLES.ADMIN,
        ROLES.COUNTRYMANAGER,
        ROLES.BRANCHMANAGER
    ),
    validate(deleteInsuranceSchema),
    deleteInsurance
);

/**
 * @swagger
 * /api/insurance/{id}/upload-document:
 *   post:
 *     summary: Upload insurance policy document
 *     tags: [Insurance]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               policyDocument:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Document uploaded successfully
 */
router.post(
    "/:id/upload-document",
    authenticate,
    authorize(
        ROLES.COUNTRYMANAGER,
        ROLES.BRANCHMANAGER
    ),
    upload.single("policyDocument"),
    validate(uploadDocumentSchema),
    uploadInsuranceDocument
);

module.exports = router;
