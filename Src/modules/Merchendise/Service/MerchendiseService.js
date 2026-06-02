const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Merchendise = require('../Model/MerchendiseModel.js');
const { jwtConfig } = require('../../../config/jwtConfig.js');
const AppError = require('../../../shared/utils/AppError.js');
const filterBody = require('../../../shared/utils/filterBody.js');
const validatePassword = require('../../../shared/utils/passwordValidator.js');
const { applyQueryFeatures } = require('../../../shared/utils/queryHelper');

const ALLOWED_UPDATE_FIELDS = ['fullName', 'email', 'phone', 'status', 'password', 'permissions'];
const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_TIME_MS = 30 * 60 * 1000;

exports.loginService = async (email, password) => {
    const user = await Merchendise.findOne({ email: email.toLowerCase(), isDeleted: false });
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
        { id: user._id, role: 'MERCHENDISE' },
        process.env.JWT_SECRET,
        { expiresIn: jwtConfig.accessTokenExpiry }
    );

    const refreshToken = jwt.sign(
        { id: user._id, nonce: Math.random().toString() },
        process.env.JWT_REFRESH_SECRET,
        { expiresIn: jwtConfig.refreshTokenExpiry }
    );

    user.refreshToken = refreshToken;
    await user.save();

    const userObj = user.toObject();
    delete userObj.passwordHash;
    delete userObj.refreshToken;

    return { accessToken, refreshToken, user: userObj };
};

exports.getById = async (id) => {
    const user = await Merchendise.findOne({ _id: id, isDeleted: false }).select('-passwordHash -refreshToken');
    if (!user) throw new AppError('Merchendise user not found', 404);
    return user;
};

exports.create = async (data) => {
    const existing = await Merchendise.findOne({ email: data.email.toLowerCase() });
    if (existing) throw new AppError('Email already in use', 400);

    if (data.password) {
        validatePassword(data.password);
    }
    const passwordToHash = data.password || 'Password@123'; // Default secure password if none provided
    const hashedPassword = await bcrypt.hash(passwordToHash, 12);
    
    const newUser = await Merchendise.create({
        fullName: data.fullName,
        email: data.email.toLowerCase(),
        phone: data.phone,
        passwordHash: hashedPassword,
        status: data.status || 'ACTIVE',
        permissions: data.permissions || [],
        createdBy: data.createdBy,
        creatorRole: data.creatorRole
    });

    const userObj = newUser.toObject();
    delete userObj.passwordHash;
    delete userObj.refreshToken;
    return userObj;
};

exports.update = async (id, body) => {
    const filtered = filterBody(body, ...ALLOWED_UPDATE_FIELDS);
    
    if (filtered.password) {
        validatePassword(filtered.password);
        filtered.passwordHash = await bcrypt.hash(filtered.password, 12);
        delete filtered.password;
    }

    if (Object.keys(filtered).length === 0) {
        throw new AppError('No valid fields to update', 400);
    }

    const updated = await Merchendise.findByIdAndUpdate(id, filtered, {
        new: true,
        runValidators: true,
    }).select('-passwordHash -refreshToken');

    if (!updated) throw new AppError('Merchendise user not found', 404);
    return updated;
};

exports.remove = async (id) => {
    const result = await Merchendise.findByIdAndUpdate(id, { isDeleted: true }, { new: true });
    if (!result) throw new AppError('Merchendise user not found', 404);
};

exports.getAll = async (queryParams = {}, options = {}) => {
    try {
        const queryOptions = {
            searchFields: ["fullName", "email"],
            filterFields: ["status"],
            dateFilterField: "createdAt",
            ...options
        };
        return await applyQueryFeatures(Merchendise, queryParams, queryOptions);
    } catch (error) {
        throw error;
    }
};
