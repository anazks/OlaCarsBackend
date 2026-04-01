const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const WorkshopManager = require('../Model/WorkshopManagerModel.js');
const { jwtConfig } = require('../../../config/jwtConfig.js');
const filterBody = require('../../../shared/utils/filterBody.js');
const validatePassword = require('../../../shared/utils/passwordValidator.js');
const AppError = require('../../../shared/utils/AppError.js');

const ALLOWED_UPDATE_FIELDS = ['fullName', 'email', 'phone', 'status', 'branchId'];
const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_TIME_MS = 30 * 60 * 1000;

exports.login = async (email, password) => {
    const manager = await WorkshopManager.findOne({ email, isDeleted: false });
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
        { id: manager._id, role: manager.role, branchId: manager.branchId },
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

    const managerObj = manager.toObject();
    delete managerObj.passwordHash;
    delete managerObj.refreshToken;

    return { accessToken, refreshToken, manager: managerObj };
};

exports.create = async (data) => {
    validatePassword(data.password);
    const hashedPassword = await bcrypt.hash(data.password, 12);

    const newManager = await WorkshopManager.create({
        fullName: data.fullName,
        email: data.email,
        phone: data.phone,
        passwordHash: hashedPassword,
        branchId: data.branchId,
        status: data.status,
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

    const updated = await WorkshopManager.findByIdAndUpdate(id, filtered, {
        new: true,
        runValidators: true,
    }).select('-passwordHash -refreshToken');

    if (!updated) throw new AppError('Workshop Manager not found', 404);
    return updated;
};

exports.changePassword = async (id, currentPassword, newPassword) => {
    const manager = await WorkshopManager.findById(id);
    if (!manager) throw new AppError('Workshop Manager not found', 404);

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
    const result = await WorkshopManager.findByIdAndUpdate(id, { isDeleted: true }, { new: true });
    if (!result) throw new AppError('Workshop Manager not found', 404);
};

const { getWorkshopManagerService } = require('../Repo/WorkshopManagerRepo.js');

exports.getAll = async (queryParams = {}, options = {}) => {
    return await getWorkshopManagerService(queryParams, {
        baseQuery: { isDeleted: false },
        select: '-passwordHash -refreshToken',
        defaultSort: { createdAt: -1 },
        ...options
    });
};

exports.getById = async (id) => {
    return await WorkshopManager.findOne({ _id: id, isDeleted: false }).select('-passwordHash -refreshToken');
};
exports.refreshSession = async (token) => {
    try {
        const decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
        const manager = await WorkshopManager.findById(decoded.id);

        if (!manager || manager.refreshToken !== token) {
            throw new AppError('Invalid refresh token', 401);
        }

        const accessToken = jwt.sign(
            { id: manager._id, role: manager.role, branchId: manager.branchId },
            process.env.JWT_SECRET,
            { expiresIn: jwtConfig.accessTokenExpiry }
        );

        const newRefreshToken = jwt.sign(
            { id: manager._id },
            process.env.JWT_REFRESH_SECRET,
            { expiresIn: jwtConfig.refreshTokenExpiry }
        );

        manager.refreshToken = newRefreshToken;
        await manager.save();

        return { accessToken, refreshToken: newRefreshToken };
    } catch (error) {
        if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
            throw new AppError('Invalid or expired refresh token', 401);
        }
        throw error;
    }
};
