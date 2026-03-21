const express = require("express");
const AgreementController = require("../Controller/AgreementController");
const { authorize } = require("../../../shared/middlewares/roleMiddleWare.js");
const { authenticate } = require("../../../shared/middlewares/authMiddleware.js");
const { ROLES } = require("../../../shared/constants/roles.js");
const multer = require("multer");

const {
    acceptAgreement,
    getUserAcceptances,
    verifyLatestAcceptance
} = require("../Controller/AgreementAcceptanceController");

const router = express.Router();
const storage = multer.memoryStorage();
const upload = multer({ storage });

/**
 * @swagger
 * tags:
 *   name: Agreement
 *   description: Agreement Management APIs (Terms, Privacy, etc.)
 */

// Public routes
/**
 * @swagger
 * /api/agreements:
 *   get:
 *     summary: Get all latest agreements
 *     tags: [Agreement]
 *     parameters:
 *       - in: query
 *         name: country
 *         schema:
 *           type: string
 *         description: Filter by country (e.g., US, NG)
 *     responses:
 *       200:
 *         description: List of latest agreements
 */
router.get("/", AgreementController.getAllAgreements);

/**
 * @swagger
 * /api/agreements/{id}:
 *   get:
 *     summary: Get agreement by ID
 *     tags: [Agreement]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Agreement details
 *       404:
 *         description: Agreement not found
 */
router.get("/:id", AgreementController.getAgreementById);

// Protected routes
router.use(authenticate);
router.use(authorize(ROLES.ADMIN, ROLES.OPERATIONADMIN, ROLES.COUNTRYMANAGER));

/**
 * @swagger
 * /api/agreements:
 *   post:
 *     summary: Create new agreement
 *     tags: [Agreement]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *               - country
 *               - type
 *               - content
 *             properties:
 *               title:
 *                 type: string
 *                 example: Terms and Conditions
 *               country:
 *                 type: string
 *                 example: US
 *               type:
 *                 type: string
 *                 enum: [TERMS_AND_CONDITIONS, PRIVACY_POLICY, RETURN_POLICY, OTHER]
 *               content:
 *                 type: string
 *                 description: HTML content from editor
 *               status:
 *                 type: string
 *                 enum: [DRAFT, PUBLISHED, ARCHIVED]
 *     responses:
 *       201:
 *         description: Agreement created successfully
 *       400:
 *         description: Bad request (e.g., duplicate title for country)
 */
router.post("/", AgreementController.createAgreement);

/**
 * @swagger
 * /api/agreements/{id}:
 *   put:
 *     summary: Update an agreement
 *     tags: [Agreement]
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
 *             properties:
 *               title:
 *                 type: string
 *               country:
 *                 type: string
 *               type:
 *                 type: string
 *               content:
 *                 type: string
 *               status:
 *                 type: string
 *     responses:
 *       200:
 *         description: Agreement updated successfully (version incremented for meaningful changes)
 *       404:
 *         description: Agreement not found
 */
router.put("/:id", AgreementController.updateAgreement);

/**
 * @swagger
 * /api/agreements/placeholders:
 *   get:
 *     summary: Get available placeholders for dynamic templates
 *     tags: [Agreement]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of placeholders
 */
router.get("/placeholders", authenticate, authorize(ROLES.ADMIN, ROLES.OPERATIONADMIN, ROLES.COUNTRYMANAGER), AgreementController.getAvailablePlaceholders);

/**
 * @swagger
 * /api/agreements/{id}/versions:
 *   get:
 *     summary: Get all versions of an agreement
 *     tags: [Agreement]
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
 *         description: List of agreement versions
 */
router.get("/:id/versions", AgreementController.getAgreementVersions);

/**
 * @swagger
 * /api/agreements/{id}/render:
 *   get:
 *     summary: Render agreement with dynamic placeholders for the logged-in user
 *     tags: [Agreement]
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
 *         description: Rendered agreement content
 */
router.get("/:id/render", authenticate, AgreementController.renderAgreement);

// Agreement Acceptance Flow
/**
 * @swagger
 * /api/agreements/accept:
 *   post:
 *     summary: Record user acceptance of an agreement version
 *     tags: [Agreement]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - agreementId
 *               - versionId
 *               - signatureType
 *             properties:
 *               agreementId:
 *                 type: string
 *               versionId:
 *                 type: string
 *               signatureType:
 *                 type: string
 *                 enum: [CLICK_WRAP, TYPED, DRAWN]
 *               signatureData:
 *                 type: string
 *                 description: Typed name (if TYPED) or base64 (if IMAGE, though multipart is preferred)
 *               signatureImage:
 *                 type: string
 *                 format: binary
 *                 description: File upload if signatureType is DRAWN
 *     responses:
 *       201:
 *         description: Acceptance recorded
 */
router.post("/accept", authenticate, upload.single("signatureImage"), acceptAgreement);

/**
 * @swagger
 * /api/agreements/acceptances/{userId}:
 *   get:
 *     summary: Get all agreements accepted by a user
 *     tags: [Agreement]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of acceptances
 */
router.get("/acceptances/:userId", authenticate, getUserAcceptances);

/**
 * @swagger
 * /api/agreements/verify/{userId}/{agreementId}:
 *   get:
 *     summary: Verify if a user has accepted the latest version of an agreement
 *     tags: [Agreement]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: agreementId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Verification status
 */
router.get("/verify/:userId/:agreementId", authenticate, verifyLatestAcceptance);

module.exports = router;
