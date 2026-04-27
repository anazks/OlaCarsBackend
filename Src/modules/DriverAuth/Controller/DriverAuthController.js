const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { Driver } = require("../../Driver/Model/DriverModel");
const { jwtConfig } = require("../../../config/jwtConfig");
const validatePassword = require("../../../shared/utils/passwordValidator");
const AppError = require("../../../shared/utils/AppError");
const { sendOTP } = require("../../../utils/emailService");


/**
 * Register a new driver (self-registration).
 * Creates a Driver(DRAFT) record directly.
 * @route POST /api/driver-auth/register
 */
const register = async (req, res) => {
    try {
        const { fullName, email, phone } = req.body;

        if (!fullName || !email) {
            throw new AppError("Full name and email are required.", 400);
        }

        // Check if email already exists in Driver collection
        const existingDriver = await Driver.findOne({ "personalInfo.email": email.toLowerCase(), isDeleted: false });
        if (existingDriver) {
            throw new AppError("A driver account with this email already exists.", 409);
        }

        // Create Driver record in DRAFT status
        // Since we combined models, Driver IS the User.
        const driverPayload = {
            status: "DRAFT",
            personalInfo: {
                fullName,
                email: email.toLowerCase(),
                phone,
            },
            role: "USER",
            createdBy: new mongoose.Types.ObjectId(), // Self-created (will be updated to its own ID if needed, but usually creatorRole 'USER' handles it)
            creatorRole: "USER", // Self-registration
        };

        if (req.body.branch) {
            driverPayload.branch = req.body.branch;
        }

        const newDriver = await Driver.create(driverPayload);

        // Update createdBy to its own ID for self-registration
        newDriver.createdBy = newDriver._id;
        await newDriver.save();

        return res.status(201).json({
            success: true,
            message: "Account created successfully. Please log in to continue.",
            data: {
                driverId: newDriver._id,
                email: newDriver.personalInfo.email,
            },
        });
    } catch (error) {
        const statusCode = error.statusCode || 500;
        return res.status(statusCode).json({ success: false, message: error.message });
    }
};

/**
 * Request OTP for Driver login.
 * @route POST /api/driver-auth/request-otp
 */
const requestOTP = async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) throw new AppError("Email is required.", 400);

        const driver = await Driver.findOne({ "personalInfo.email": email.toLowerCase(), isDeleted: false });
        if (!driver) throw new AppError("No account found with this email.", 404);

        // For drivers, we allow request-otp even in DRAFT status so they can continue onboarding
        // but let's check if they are SUSPENDED or REJECTED
        if (["SUSPENDED", "REJECTED"].includes(driver.status)) {
            throw new AppError(`Account is ${driver.status.toLowerCase()}.`, 403);
        }

        // Generate 6-digit OTP
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

        driver.otp = otp;
        driver.otpExpires = otpExpires;
        await driver.save();

        // Send Email
        await sendOTP(driver.personalInfo.email, otp, driver.personalInfo.fullName);

        return res.status(200).json({
            success: true,
            message: "OTP sent to your email.",
        });
    } catch (error) {
        const statusCode = error.statusCode || 500;
        return res.status(statusCode).json({ success: false, message: error.message });
    }
};

/**
 * Driver login — Step 2: Verify OTP.
 * @route POST /api/driver-auth/login
 */
const login = async (req, res) => {
    try {
        const { email, otp } = req.body;

        if (!email || !otp) {
            throw new AppError("Email and OTP are required.", 400);
        }

        const driver = await Driver.findOne({ "personalInfo.email": email.toLowerCase(), isDeleted: false });
        if (!driver) throw new AppError("Invalid credentials.", 401);

        // Check account lock
        if (driver.lockUntil && driver.lockUntil > Date.now()) {
            throw new AppError("Account is locked. Try again later.", 423);
        }

        if (["SUSPENDED", "REJECTED"].includes(driver.status)) {
            throw new AppError(`Account is ${driver.status.toLowerCase()}.`, 403);
        }

        // Verify OTP (DISABLED FOR TESTING - as per previous user request)
        /*
        if (!driver.otp || driver.otp !== otp || driver.otpExpires < Date.now()) {
            driver.failedLoginAttempts = (driver.failedLoginAttempts || 0) + 1;
            if (driver.failedLoginAttempts >= 5) {
                driver.lockUntil = new Date(Date.now() + 30 * 60 * 1000);
            }
            await driver.save();
            throw new AppError("Invalid or expired OTP.", 401);
        }
        */
       console.log(`[TEST MODE] Bypassing OTP check for ${email}`);

        // Reset OTP and failed attempts
        driver.otp = undefined;
        driver.otpExpires = undefined;
        driver.failedLoginAttempts = 0;
        driver.lockUntil = undefined;
        driver.lastLoginAt = new Date();
        await driver.save();

        // Generate tokens
        const accessToken = jwt.sign(
            { id: String(driver._id), email: driver.personalInfo.email, role: "USER" },
            process.env.JWT_SECRET,
            { expiresIn: jwtConfig.accessTokenExpiry }
        );

        const refreshToken = jwt.sign(
            { id: driver._id },
            process.env.JWT_REFRESH_SECRET,
            { expiresIn: jwtConfig.refreshTokenExpiry }
        );

        driver.refreshToken = refreshToken;
        await driver.save();

        // Final populate for returned object
        const populatedDriver = await Driver.findById(driver._id)
            .populate("branch", "name location")
            .populate("currentVehicle");

        return res.status(200).json({
            success: true,
            message: "Login successful.",
            accessToken,
            refreshToken,
            user: populatedDriver, // Returning the whole driver as the user object
            driver: populatedDriver,
        });
    } catch (error) {
        const statusCode = error.statusCode || 500;
        return res.status(statusCode).json({ success: false, message: error.message });
    }
};

module.exports = { register, login, requestOTP };
