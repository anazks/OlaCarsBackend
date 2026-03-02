const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Admin = require('../model/adminModel.js');
const { jwtConfig } = require('../../../config/jwtConfig.js');
const filterBody = require('../../../shared/utils/filterBody.js');
const validatePassword = require('../../../shared/utils/passwordValidator.js');
const AppError = require('../../../shared/utils/AppError.js');

const ALLOWED_UPDATE_FIELDS = ['fullName', 'email', 'status', 'twoFactorEnabled'];
const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_TIME_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Handles Admin login with lockout tracking.
 */
exports.login = async (email, password) => {
    const admin = await Admin.findOne({ email, isDeleted: false });
    if (!admin) throw new AppError('Invalid credentials', 401);

    // Check if account is locked
    if (admin.lockUntil && admin.lockUntil > Date.now()) {
        throw new AppError('Account is locked. Try again later.', 423);
    }

    if (admin.status !== 'ACTIVE') throw new AppError('Account not active', 403);

    const isMatch = await bcrypt.compare(password, admin.passwordHash);
    if (!isMatch) {
        // Increment failed attempts
        admin.failedLoginAttempts = (admin.failedLoginAttempts || 0) + 1;
        if (admin.failedLoginAttempts >= MAX_LOGIN_ATTEMPTS) {
            admin.lockUntil = new Date(Date.now() + LOCK_TIME_MS);
            admin.status = 'LOCKED';
        }
        await admin.save();
        throw new AppError('Invalid credentials', 401);
    }

    // Reset on successful login
    admin.failedLoginAttempts = 0;
    admin.lockUntil = undefined;
    admin.lastLoginAt = new Date();

    const accessToken = jwt.sign(
        { id: admin._id, role: admin.role },
        process.env.JWT_SECRET,
        { expiresIn: jwtConfig.accessTokenExpiry }
    );

    const refreshToken = jwt.sign(
        { id: admin._id },
        process.env.JWT_REFRESH_SECRET,
        { expiresIn: jwtConfig.refreshTokenExpiry }
    );

    admin.refreshToken = refreshToken;
    await admin.save();

    return { accessToken, refreshToken };
};

/**
 * Refreshes access token using a valid refresh token.
 */
exports.refreshAccessToken = async (token) => {
    const decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
    const admin = await Admin.findById(decoded.id);

    if (!admin || admin.refreshToken !== token) {
        throw new AppError('Invalid refresh token', 403);
    }

    const newAccessToken = jwt.sign(
        { id: admin._id, role: admin.role },
        process.env.JWT_SECRET,
        { expiresIn: jwtConfig.accessTokenExpiry }
    );

    return { accessToken: newAccessToken };
};

/**
 * Creates a new Admin with password hashing and field filtering.
 */
exports.create = async (data) => {
    validatePassword(data.password);
    const hashedPassword = await bcrypt.hash(data.password, 12);

    const newAdmin = await Admin.create({
        fullName: data.fullName,
        email: data.email,
        passwordHash: hashedPassword,
        status: data.status,
        twoFactorEnabled: data.twoFactorEnabled,
        createdBy: data.createdBy,
        creatorRole: data.creatorRole,
    });

    const adminObj = newAdmin.toObject();
    delete adminObj.passwordHash;
    delete adminObj.refreshToken;
    return adminObj;
};

/**
 * Updates an Admin using whitelisted fields only.
 */
exports.update = async (id, body) => {
    const filtered = filterBody(body, ...ALLOWED_UPDATE_FIELDS);
    if (Object.keys(filtered).length === 0) {
        throw new AppError('No valid fields to update', 400);
    }

    const updated = await Admin.findByIdAndUpdate(id, filtered, {
        new: true,
        runValidators: true,
    }).select('-passwordHash -refreshToken');

    if (!updated) throw new AppError('Admin not found', 404);
    return updated;
};

/**
 * Changes password with current password verification and strength validation.
 */
exports.changePassword = async (id, currentPassword, newPassword) => {
    const admin = await Admin.findById(id);
    if (!admin) throw new AppError('Admin not found', 404);

    const isMatch = await bcrypt.compare(currentPassword, admin.passwordHash);
    if (!isMatch) throw new AppError('Current password is incorrect', 401);

    validatePassword(newPassword);

    admin.passwordHash = await bcrypt.hash(newPassword, 12);
    admin.passwordChangedAt = new Date();
    admin.failedLoginAttempts = 0;
    admin.lockUntil = undefined;
    await admin.save();

    return { message: 'Password changed successfully' };
};

/**
 * Soft deletes an Admin.
 */
exports.remove = async (id) => {
    const result = await Admin.findByIdAndUpdate(id, { isDeleted: true }, { new: true });
    if (!result) throw new AppError('Admin not found', 404);
};

/**
 * Retrieves all active Admins.
 */
exports.getAll = async () => {
    return await Admin.find({ isDeleted: false }).select('-passwordHash -refreshToken');
};

/**
 * Retrieves an Admin by ID.
 */
exports.getById = async (id) => {
    return await Admin.findOne({ _id: id, isDeleted: false }).select('-passwordHash -refreshToken');
};
