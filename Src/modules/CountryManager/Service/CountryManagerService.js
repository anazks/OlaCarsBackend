const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const CountryManager = require('../Model/CountryManagerModel.js');
const { jwtConfig } = require('../../../config/jwtConfig.js');
const filterBody = require('../../../shared/utils/filterBody.js');
const validatePassword = require('../../../shared/utils/passwordValidator.js');
const AppError = require('../../../shared/utils/AppError.js');

const ALLOWED_UPDATE_FIELDS = ['fullName', 'email', 'phone', 'status', 'twoFactorEnabled', 'country'];
const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_TIME_MS = 30 * 60 * 1000;

exports.login = async (email, password) => {
    const manager = await CountryManager.findOne({ email, isDeleted: false });
    if (!manager) throw new AppError('Invalid credentials', 401);

    if (manager.lockUntil && manager.lockUntil > Date.now()) {
        throw new AppError('Account is locked. Try again later.', 423);
    }

    if (manager.status !== 'ACTIVE') throw new AppError('Account not active', 403);

    const isMatch = await bcrypt.compare(password, manager.passwordHash);
    if (!isMatch) {
        manager.failedLoginAttempts = (manager.failedLoginAttempts || 0) + 1;
        if (manager.failedLoginAttempts >= MAX_LOGIN_ATTEMPTS) {
            manager.lockUntil = new Date(Date.now() + LOCK_TIME_MS);
            manager.status = 'LOCKED';
        }
        await manager.save();
        throw new AppError('Invalid credentials', 401);
    }

    manager.failedLoginAttempts = 0;
    manager.lockUntil = undefined;
    manager.lastLoginAt = new Date();

    const accessToken = jwt.sign(
        { id: manager._id, role: manager.role, country: manager.country },
        process.env.JWT_SECRET,
        { expiresIn: jwtConfig.accessTokenExpiry }
    );

    const refreshToken = jwt.sign(
        { id: manager._id },
        process.env.JWT_REFRESH_SECRET,
        { expiresIn: jwtConfig.refreshTokenExpiry }
    );

    manager.refreshToken = refreshToken;
    await manager.save();

    return { accessToken, refreshToken };
};

exports.refreshAccessToken = async (token) => {
    const decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
    const manager = await CountryManager.findById(decoded.id);

    if (!manager || manager.refreshToken !== token) {
        throw new AppError('Invalid refresh token', 403);
    }

    const newAccessToken = jwt.sign(
        { id: manager._id, role: manager.role, country: manager.country },
        process.env.JWT_SECRET,
        { expiresIn: jwtConfig.accessTokenExpiry }
    );

    return { accessToken: newAccessToken };
};

exports.create = async (data) => {
    validatePassword(data.password);
    const hashedPassword = await bcrypt.hash(data.password, 12);

    const newManager = await CountryManager.create({
        fullName: data.fullName,
        email: data.email,
        phone: data.phone,
        passwordHash: hashedPassword,
        status: data.status,
        twoFactorEnabled: data.twoFactorEnabled,
        country: data.country,
        createdBy: data.createdBy,
        creatorRole: data.creatorRole,
    });

    const managerObj = newManager.toObject();
    delete managerObj.passwordHash;
    delete managerObj.refreshToken;
    return managerObj;
};

exports.update = async (id, body) => {
    const filtered = filterBody(body, ...ALLOWED_UPDATE_FIELDS);
    if (Object.keys(filtered).length === 0) {
        throw new AppError('No valid fields to update', 400);
    }

    const updated = await CountryManager.findByIdAndUpdate(id, filtered, {
        new: true,
        runValidators: true,
    }).select('-passwordHash -refreshToken');

    if (!updated) throw new AppError('Country Manager not found', 404);
    return updated;
};

exports.changePassword = async (id, currentPassword, newPassword) => {
    const manager = await CountryManager.findById(id);
    if (!manager) throw new AppError('Country Manager not found', 404);

    const isMatch = await bcrypt.compare(currentPassword, manager.passwordHash);
    if (!isMatch) throw new AppError('Current password is incorrect', 401);

    validatePassword(newPassword);

    manager.passwordHash = await bcrypt.hash(newPassword, 12);
    manager.passwordChangedAt = new Date();
    manager.failedLoginAttempts = 0;
    manager.lockUntil = undefined;
    await manager.save();

    return { message: 'Password changed successfully' };
};

exports.remove = async (id) => {
    const result = await CountryManager.findByIdAndUpdate(id, { isDeleted: true }, { new: true });
    if (!result) throw new AppError('Country Manager not found', 404);
};

exports.getAll = async () => {
    return await CountryManager.find({ isDeleted: false }).select('-passwordHash -refreshToken');
};

exports.getById = async (id) => {
    return await CountryManager.findOne({ _id: id, isDeleted: false }).select('-passwordHash -refreshToken');
};
