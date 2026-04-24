const express = require("express");
const router = express.Router();
const {
    register,
    login,
    requestOTP,
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
 *               phone:
 *                 type: string
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
 *               otp:
 *                 type: string
 *     responses:
 *       200:
 *         description: Login successful, returns tokens and driver profile
 *       401:
 *         description: Invalid or expired OTP
 */
router.post("/login", login);

module.exports = router;
