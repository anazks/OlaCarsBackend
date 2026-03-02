const express = require("express");
const {
    login,
    refreshToken,
    addCountryManager,
    editCountryManager,
    changePassword,
    deleteCountryManager,
    getCountryManagers,
    getCountryManagerById
} = require("../Controller/CountryManagerController.js");
const { authorize } = require("../../../shared/middlewares/roleMiddleWare.js");
const { authenticate } = require("../../../shared/middlewares/authMiddleware.js");
const { ROLES } = require("../../../shared/constants/roles.js");

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: CountryManager
 *   description: Country Manager Management APIs
 */

/**
 * @swagger
 * /api/country-manager/login:
 *   post:
 *     summary: Country Manager login
 *     tags: [CountryManager]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 example: manager@olacars.com
 *               password:
 *                 type: string
 *                 example: StrongPassword@123
 *     responses:
 *       200:
 *         description: Login successful
 *       401:
 *         description: Invalid credentials
 */
router.post("/login", login);

/**
 * @swagger
 * /api/country-manager/refresh:
 *   post:
 *     summary: Refresh access token
 *     tags: [CountryManager]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               refreshToken:
 *                 type: string
 *     responses:
 *       200:
 *         description: New access token generated
 */
router.post("/refresh", refreshToken);

/**
 * @swagger
 * /api/country-manager:
 *   post:
 *     summary: Create new country manager
 *     tags: [CountryManager]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - fullName
 *               - email
 *               - password
 *               - country
 *             properties:
 *               fullName:
 *                 type: string
 *                 example: John Doe
 *               email:
 *                 type: string
 *                 example: john.doe@example.com
 *               password:
 *                 type: string
 *                 example: Password123!
 *               phone:
 *                 type: string
 *                 example: +1234567890
 *               country:
 *                 type: string
 *                 example: United States
 *               status:
 *                 type: string
 *                 enum: [ACTIVE, SUSPENDED, LOCKED]
 *               twoFactorEnabled:
 *                 type: boolean
 *     responses:
 *       201:
 *         description: Country Manager created successfully
 *       500:
 *         description: Internal Server Error
 */
router.post(
    "/",
    authenticate,
    authorize(ROLES.ADMIN, ROLES.OPERATIONADMIN, ROLES.FINANCEADMIN),
    addCountryManager
);

/**    
 * @swagger
 * /api/country-manager:
 *   get:
 *     summary: Get all country managers
 *     tags: [CountryManager]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of country managers
 *       500:
 *         description: Internal Server Error
 */
router.get(
    "/",
    authenticate,
    authorize(ROLES.ADMIN, ROLES.OPERATIONADMIN, ROLES.FINANCEADMIN),
    getCountryManagers
);

/**
 * @swagger
 * /api/country-manager/{id}:
 *   get:
 *     summary: Get country manager by ID
 *     tags: [CountryManager]
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
 *         description: Country Manager details
 *       404:
 *         description: Country Manager not found
 *       500:
 *         description: Internal Server Error
 */
router.get(
    "/:id",
    authenticate,
    authorize(ROLES.ADMIN, ROLES.OPERATIONADMIN, ROLES.FINANCEADMIN),
    getCountryManagerById
);

/**
 * @swagger
 * /api/country-manager/update:
 *   put:
 *     summary: Update country manager
 *     tags: [CountryManager]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - id
 *             properties:
 *               id:
 *                 type: string
 *                 example: 60d21b4667d0d8992e610c85
 *               fullName:
 *                 type: string
 *               phone:
 *                 type: string
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *               country:
 *                 type: string
 *               status:
 *                 type: string
 *                 enum: [ACTIVE, SUSPENDED, LOCKED]
 *               twoFactorEnabled:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Country Manager updated successfully
 *       500:
 *         description: Internal Server Error
 */
router.put(
    "/:id",
    authenticate,
    authorize(ROLES.ADMIN, ROLES.OPERATIONADMIN, ROLES.FINANCEADMIN),
    editCountryManager
);

/**
 * @swagger
 * /api/country-manager/{id}/change-password:
 *   post:
 *     summary: Change Country Manager password
 *     tags: [CountryManager]
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
 *               - currentPassword
 *               - newPassword
 *             properties:
 *               currentPassword:
 *                 type: string
 *               newPassword:
 *                 type: string
 *     responses:
 *       200:
 *         description: Password changed successfully
 */
router.post(
    "/:id/change-password",
    authenticate,
    authorize(ROLES.ADMIN, ROLES.OPERATIONADMIN, ROLES.FINANCEADMIN),
    changePassword
);

/**
 * @swagger
 * /api/country-manager/{id}:
 *   delete:
 *     summary: Soft delete country manager
 *     tags: [CountryManager]
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
 *         description: Country Manager deleted successfully
 *       500:
 *         description: Internal Server Error
 */
router.delete(
    "/:id",
    authenticate,
    authorize(ROLES.ADMIN, ROLES.OPERATIONADMIN, ROLES.FINANCEADMIN),
    deleteCountryManager
);



module.exports = router;
