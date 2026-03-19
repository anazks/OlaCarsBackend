const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const OperationalAdmin = require('../model/OperationAdminModel.js');
const { jwtConfig } = require('../../../config/jwtConfig.js');
const filterBody = require('../../../shared/utils/filterBody.js');
const validatePassword = require('../../../shared/utils/passwordValidator.js');
const AppError = require('../../../shared/utils/AppError.js');

const ALLOWED_UPDATE_FIELDS = ['fullName', 'email', 'status', 'twoFactorEnabled'];
const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_TIME_MS = 30 * 60 * 1000;

exports.login = async (email, password) => {
    const admin = await OperationalAdmin.findOne({ email, isDeleted: false });
    if (!admin) throw new AppError('Invalid credentials', 401);

    if (admin.lockUntil && admin.lockUntil > Date.now()) {
        throw new AppError('Account is locked. Try again later.', 423);
    }

    if (admin.status !== 'ACTIVE') throw new AppError('Account not active', 403);

    const isMatch = await bcrypt.compare(password, admin.passwordHash);
    if (!isMatch) {
        admin.failedLoginAttempts = (admin.failedLoginAttempts || 0) + 1;
        if (admin.failedLoginAttempts >= MAX_LOGIN_ATTEMPTS) {
            admin.lockUntil = new Date(Date.now() + LOCK_TIME_MS);
            admin.status = 'LOCKED';
        }
        await admin.save();
        throw new AppError('Invalid credentials', 401);
    }

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

exports.refreshAccessToken = async (token) => {
    const decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
    const admin = await OperationalAdmin.findById(decoded.id);

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

exports.create = async (data) => {
    validatePassword(data.password);
    const hashedPassword = await bcrypt.hash(data.password, 12);

    const newAdmin = await OperationalAdmin.create({
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

exports.update = async (id, body) => {
    const filtered = filterBody(body, ...ALLOWED_UPDATE_FIELDS);
    if (Object.keys(filtered).length === 0) {
        throw new AppError('No valid fields to update', 400);
    }

    const updated = await OperationalAdmin.findByIdAndUpdate(id, filtered, {
        new: true,
        runValidators: true,
    }).select('-passwordHash -refreshToken');

    if (!updated) throw new AppError('Operational Admin not found', 404);
    return updated;
};

exports.changePassword = async (id, currentPassword, newPassword) => {
    const admin = await OperationalAdmin.findById(id);
    if (!admin) throw new AppError('Operational Admin not found', 404);

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

exports.remove = async (id) => {
    const result = await OperationalAdmin.findByIdAndUpdate(id, { isDeleted: true }, { new: true });
    if (!result) throw new AppError('Operational Admin not found', 404);
};

const { getOperationalAdminsService } = require('../Repo/OperationAdminRepo.js');

exports.getAll = async (queryParams = {}) => {
    return await getOperationalAdminsService(queryParams, {
        baseQuery: { isDeleted: false },
        select: '-passwordHash -refreshToken',
        defaultSort: { createdAt: -1 }
    });
};

exports.getById = async (id) => {
    return await OperationalAdmin.findOne({ _id: id, isDeleted: false }).select('-passwordHash -refreshToken');
};
