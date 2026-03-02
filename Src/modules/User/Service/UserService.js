const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../Model/UserModel.js');
const { jwtConfig } = require('../../../config/jwtConfig.js');
const filterBody = require('../../../shared/utils/filterBody.js');
const validatePassword = require('../../../shared/utils/passwordValidator.js');
const AppError = require('../../../shared/utils/AppError.js');

const ALLOWED_UPDATE_FIELDS = ['fullName', 'email', 'phone', 'status'];
const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_TIME_MS = 30 * 60 * 1000;

exports.login = async (email, password) => {
    const user = await User.findOne({ email, isDeleted: false });
    if (!user) throw new AppError('Invalid credentials', 401);

    if (user.lockUntil && user.lockUntil > Date.now()) {
        throw new AppError('Account is locked. Try again later.', 423);
    }

    if (user.status !== 'ACTIVE') throw new AppError('Account not active', 403);

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
        user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;
        if (user.failedLoginAttempts >= MAX_LOGIN_ATTEMPTS) {
            user.lockUntil = new Date(Date.now() + LOCK_TIME_MS);
            user.status = 'LOCKED';
        }
        await user.save();
        throw new AppError('Invalid credentials', 401);
    }

    user.failedLoginAttempts = 0;
    user.lockUntil = undefined;
    user.lastLoginAt = new Date();

    const accessToken = jwt.sign(
        { id: user._id, role: user.role },
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

    return { accessToken, refreshToken };
};

exports.create = async (data) => {
    validatePassword(data.password);
    const hashedPassword = await bcrypt.hash(data.password, 12);

    const newUser = await User.create({
        fullName: data.fullName,
        email: data.email,
        phone: data.phone,
        passwordHash: hashedPassword,
        status: data.status,
        createdBy: data.createdBy,
        creatorRole: data.creatorRole,
    });

    const userObj = newUser.toObject();
    delete userObj.passwordHash;
    delete userObj.refreshToken;
    return userObj;
};

exports.update = async (id, body) => {
    const filtered = filterBody(body, ...ALLOWED_UPDATE_FIELDS);
    if (Object.keys(filtered).length === 0) {
        throw new AppError('No valid fields to update', 400);
    }

    const updated = await User.findByIdAndUpdate(id, filtered, {
        new: true,
        runValidators: true,
    }).select('-passwordHash -refreshToken');

    if (!updated) throw new AppError('User not found', 404);
    return updated;
};

exports.changePassword = async (id, currentPassword, newPassword) => {
    const user = await User.findById(id);
    if (!user) throw new AppError('User not found', 404);

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
    const result = await User.findByIdAndUpdate(id, { isDeleted: true }, { new: true });
    if (!result) throw new AppError('User not found', 404);
};

exports.getAll = async () => {
    return await User.find({ isDeleted: false }).select('-passwordHash -refreshToken');
};

exports.getById = async (id) => {
    return await User.findOne({ _id: id, isDeleted: false }).select('-passwordHash -refreshToken');
};
