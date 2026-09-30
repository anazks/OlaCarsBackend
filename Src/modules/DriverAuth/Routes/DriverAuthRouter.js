const express = require("express");
const router = express.Router();
const {
    register,
    login,
    requestOTP,
    getCustomerStatement,
    getVehicleDetails,
} = require("../Controller/DriverAuthController");

/**
 * @swagger
 * tags:
 *   name: DriverAuth
 *   description: Driver Self-Registration & Login (OTP-based)
 */

/**
 * @swagger
 * /api/driver-auth/register:
 *   post:
 *     summary: Driver self-registration
 *     tags: [DriverAuth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - fullName
 *               - email
 *             properties:
 *               fullName:
 *                 type: string
 *               email:
 *                 type: string
 *                 example: "user@olacars.com"
 *               phone:
 *                 type: string
 *                 example: "+1234567890"
 *               branch:
 *                 type: string
 *                 description: Optional Branch ObjectId
 *     responses:
 *       201:
 *         description: Account created, driver in DRAFT status
 *       409:
 *         description: Email already exists
 */
router.post("/register", register);

/**
 * @swagger
 * /api/driver-auth/request-otp:
 *   post:
 *     summary: Request login OTP
 *     tags: [DriverAuth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 example: "user@olacars.com"
 *     responses:
 *       200:
 *         description: OTP sent to email
 *       404:
 *         description: Email not found
 */
router.post("/request-otp", requestOTP);

/**
 * @swagger
 * /api/driver-auth/login:
 *   post:
 *     summary: Driver login (Verify OTP)
 *     tags: [DriverAuth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - otp
 *             properties:
 *               email:
 *                 type: string
 *                 example: "user@olacars.com"
 *               otp:
 *                 type: string
 *     responses:
 *       200:
 *         description: Login successful, returns tokens and driver profile
 *       401:
 *         description: Invalid or expired OTP
 */
router.post("/login", login);

/**
 * @swagger
 * /api/driver-auth/verify-otp:
 *   post:
 *     summary: Verify OTP and log in driver
 *     tags: [DriverAuth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - otp
 *             properties:
 *               email:
 *                 type: string
 *                 example: "driver@olacars.com"
 *               otp:
 *                 type: string
 *                 example: "123456"
 *     responses:
 *       200:
 *         description: Login successful, returns tokens and driver profile
 *       401:
 *         description: Invalid or expired OTP
 */
router.post("/verify-otp", login);

/**
 * @swagger
 * /api/driver-auth/statement/{customerId}:
 *   get:
 *     summary: Get customer financial statement and pending dues
 *     tags: [DriverAuth]
 *     parameters:
 *       - in: path
 *         name: customerId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Statement and pending amount data
 */
router.get("/statement/:customerId", getCustomerStatement);

/**
 * @swagger
 * /api/driver-auth/vehicle/{vehicleId}:
 *   get:
 *     summary: Get comprehensive vehicle info, documents, and specifications
 *     tags: [DriverAuth]
 *     parameters:
 *       - in: path
 *         name: vehicleId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Vehicle details with documents and specs
 */
router.get("/vehicle/:vehicleId", getVehicleDetails);

module.exports = router;

