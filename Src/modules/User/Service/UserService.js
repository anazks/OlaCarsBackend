const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Driver } = require('../../Driver/Model/DriverModel');
const { jwtConfig } = require('../../../config/jwtConfig.js');
const filterBody = require('../../../shared/utils/filterBody.js');
const validatePassword = require('../../../shared/utils/passwordValidator.js');
const AppError = require('../../../shared/utils/AppError.js');

const ALLOWED_UPDATE_FIELDS = ['fullName', 'email', 'phone', 'status'];
const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_TIME_MS = 30 * 60 * 1000;

exports.login = async (email, password) => {
    const user = await Driver.findOne({ "personalInfo.email": email.toLowerCase(), isDeleted: false });
    if (!user) throw new AppError('Invalid credentials', 401);

    if (user.lockUntil && user.lockUntil > Date.now()) {
        throw new AppError('Account is locked. Try again later.', 423);
    }

    // Drivers might be in DRAFT, PENDING REVIEW, etc. 
    // We check if they are SUSPENDED or REJECTED
    if (["SUSPENDED", "REJECTED"].includes(user.status)) {
        throw new AppError(`Account is ${user.status.toLowerCase()}`, 403);
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
        user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;
        if (user.failedLoginAttempts >= MAX_LOGIN_ATTEMPTS) {
            user.lockUntil = new Date(Date.now() + LOCK_TIME_MS);
            user.status = 'SUSPENDED'; // Mapping LOCKED to SUSPENDED for Driver model
        }
        await user.save();
        throw new AppError('Invalid credentials', 401);
    }

    user.failedLoginAttempts = 0;
    user.lockUntil = undefined;
    user.lastLoginAt = new Date();

    const accessToken = jwt.sign(
        { id: user._id, role: 'USER' },
        process.env.JWT_SECRET,
        { expiresIn: jwtConfig.accessTokenExpiry }
    );

    const refreshToken = jwt.sign(
        { id: user._id },
        process.env.JWT_REFRESH_SECRET,
        { expiresIn: jwtConfig.refreshTokenExpiry }
    );

    user.refreshToken = refreshToken;
    await user.save();

    return { accessToken, refreshToken, user };
};

exports.create = async (data) => {
    validatePassword(data.password);
    const hashedPassword = await bcrypt.hash(data.password, 12);

    const newDriver = await Driver.create({
        personalInfo: {
            fullName: data.fullName,
            email: data.email.toLowerCase(),
            phone: data.phone,
        },
        passwordHash: hashedPassword,
        status: data.status || "DRAFT",
        role: "USER",
        createdBy: data.createdBy,
        creatorRole: data.creatorRole,
        branch: data.branch || "000000000000000000000000", // Default placeholder
    });

    return newDriver;
};

exports.update = async (id, body) => {
    const updateData = {};
    if (body.fullName) updateData["personalInfo.fullName"] = body.fullName;
    if (body.email) updateData["personalInfo.email"] = body.email.toLowerCase();
    if (body.phone) updateData["personalInfo.phone"] = body.phone;
    if (body.status) updateData["status"] = body.status;

    if (Object.keys(updateData).length === 0) {
        throw new AppError('No valid fields to update', 400);
    }

    const updated = await Driver.findByIdAndUpdate(id, { $set: updateData }, {
        new: true,
        runValidators: true,
    });

    if (!updated) throw new AppError('Driver not found', 404);
    return updated;
};

exports.changePassword = async (id, currentPassword, newPassword) => {
    const user = await Driver.findById(id);
    if (!user) throw new AppError('Driver not found', 404);

    const isMatch = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isMatch) throw new AppError('Current password is incorrect', 401);

    validatePassword(newPassword);

    user.passwordHash = await bcrypt.hash(newPassword, 12);
    user.passwordChangedAt = new Date();
    user.failedLoginAttempts = 0;
    user.lockUntil = undefined;
    await user.save();

    return { message: 'Password changed successfully' };
};

exports.remove = async (id) => {
    const result = await Driver.findByIdAndUpdate(id, { isDeleted: true }, { new: true });
    if (!result) throw new AppError('Driver not found', 404);
};

exports.getAll = async () => {
    return await Driver.find({ isDeleted: false });
};

exports.getById = async (id) => {
    const driver = await Driver.findOne({ _id: id, isDeleted: false });
    if (!driver) throw new AppError('Driver not found', 404);
    return driver;
};
