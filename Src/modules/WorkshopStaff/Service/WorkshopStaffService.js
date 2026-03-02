const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const WorkshopStaff = require('../Model/WorkshopStaffModel.js');
const { jwtConfig } = require('../../../config/jwtConfig.js');
const filterBody = require('../../../shared/utils/filterBody.js');
const validatePassword = require('../../../shared/utils/passwordValidator.js');
const AppError = require('../../../shared/utils/AppError.js');

const ALLOWED_UPDATE_FIELDS = ['fullName', 'email', 'phone', 'status', 'branchId'];
const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_TIME_MS = 30 * 60 * 1000;

exports.login = async (email, password) => {
    const staff = await WorkshopStaff.findOne({ email, isDeleted: false });
    if (!staff) throw new AppError('Invalid credentials', 401);

    if (staff.lockUntil && staff.lockUntil > Date.now()) {
        throw new AppError('Account is locked. Try again later.', 423);
    }

    if (staff.status !== 'ACTIVE') throw new AppError('Account not active', 403);

    const isMatch = await bcrypt.compare(password, staff.passwordHash);
    if (!isMatch) {
        staff.failedLoginAttempts = (staff.failedLoginAttempts || 0) + 1;
        if (staff.failedLoginAttempts >= MAX_LOGIN_ATTEMPTS) {
            staff.lockUntil = new Date(Date.now() + LOCK_TIME_MS);
            staff.status = 'LOCKED';
        }
        await staff.save();
        throw new AppError('Invalid credentials', 401);
    }

    staff.failedLoginAttempts = 0;
    staff.lockUntil = undefined;
    staff.lastLoginAt = new Date();

    const accessToken = jwt.sign(
        { id: staff._id, role: staff.role, branchId: staff.branchId },
        process.env.JWT_SECRET,
        { expiresIn: jwtConfig.accessTokenExpiry }
    );

    const refreshToken = jwt.sign(
        { id: staff._id },
        process.env.JWT_REFRESH_SECRET,
        { expiresIn: jwtConfig.refreshTokenExpiry }
    );

    staff.refreshToken = refreshToken;
    await staff.save();

    return { accessToken, refreshToken };
};

exports.create = async (data) => {
    validatePassword(data.password);
    const hashedPassword = await bcrypt.hash(data.password, 12);

    const newStaff = await WorkshopStaff.create({
        fullName: data.fullName,
        email: data.email,
        phone: data.phone,
        passwordHash: hashedPassword,
        branchId: data.branchId,
        status: data.status,
        createdBy: data.createdBy,
        creatorRole: data.creatorRole,
    });

    const staffObj = newStaff.toObject();
    delete staffObj.passwordHash;
    delete staffObj.refreshToken;
    return staffObj;
};

exports.update = async (id, body) => {
    const filtered = filterBody(body, ...ALLOWED_UPDATE_FIELDS);
    if (Object.keys(filtered).length === 0) {
        throw new AppError('No valid fields to update', 400);
    }

    const updated = await WorkshopStaff.findByIdAndUpdate(id, filtered, {
        new: true,
        runValidators: true,
    }).select('-passwordHash -refreshToken');

    if (!updated) throw new AppError('Workshop Staff not found', 404);
    return updated;
};

exports.changePassword = async (id, currentPassword, newPassword) => {
    const staff = await WorkshopStaff.findById(id);
    if (!staff) throw new AppError('Workshop Staff not found', 404);

    const isMatch = await bcrypt.compare(currentPassword, staff.passwordHash);
    if (!isMatch) throw new AppError('Current password is incorrect', 401);

    validatePassword(newPassword);

    staff.passwordHash = await bcrypt.hash(newPassword, 12);
    staff.passwordChangedAt = new Date();
    staff.failedLoginAttempts = 0;
    staff.lockUntil = undefined;
    await staff.save();

    return { message: 'Password changed successfully' };
};

exports.remove = async (id) => {
    const result = await WorkshopStaff.findByIdAndUpdate(id, { isDeleted: true }, { new: true });
    if (!result) throw new AppError('Workshop Staff not found', 404);
};

exports.getAll = async () => {
    return await WorkshopStaff.find({ isDeleted: false }).select('-passwordHash -refreshToken');
};

exports.getById = async (id) => {
    return await WorkshopStaff.findOne({ _id: id, isDeleted: false }).select('-passwordHash -refreshToken');
};
