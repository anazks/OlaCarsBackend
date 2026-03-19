const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const CountryManager = require("../Model/CountryManagerModel.js");
const { jwtConfig } = require('../../../config/jwtConfig.js');

/**
 * Creates a new Country Manager in the database.
 * Hashes the password if provided.
 *
 * @param {Object} data - The payload containing the country manager details.
 * @param {string} data.fullName - Full name of the country manager.
 * @param {string} data.email - Email address.
 * @param {string} data.password - Plaintext password (will be hashed).
 * @param {string} data.phone - Phone number.
 * @param {string} data.country - The country assigned to this manager.
 * @param {string} data.createdBy - ID of the admin who created this user.
 * @param {string} data.creatorRole - Role of the admin who created this user (e.g. "ADMIN", "OPERATIONADMIN").
 * @returns {Promise<Object>} The created Country Manager document.
 */
exports.addCountryManagerService = async (data) => {
    try {
        // Hash password before saving if provided
        if (data.password) {
            const salt = await bcrypt.genSalt(10);
            data.passwordHash = await bcrypt.hash(data.password, salt);
            delete data.password;
        }

        const newManager = await CountryManager.create(data);
        return newManager;
    } catch (error) {
        throw error;
    }
};

/**
 * Updates an existing Country Manager by ID.
 * Rehashes the password if a new one is provided.
 *
 * @param {Object} data - The payload containing properties to update.
 * @param {string} data.id - The ID of the country manager to update.
 * @returns {Promise<Object>} The updated Country Manager document.
 */
exports.editCountryManagerService = async (data) => {
    try {
        const { id, ...updateData } = data;

        if (updateData.password) {
            const salt = await bcrypt.genSalt(10);
            updateData.passwordHash = await bcrypt.hash(updateData.password, salt);
            delete updateData.password;
        }

        const updatedManager = await CountryManager.findByIdAndUpdate(id, updateData, { new: true });
        return updatedManager;
    } catch (error) {
        throw error;
    }
};

/**
 * Soft deletes a Country Manager by ID.
 * Sets `isDeleted` to true instead of removing the document.
 *
 * @param {string} id - The ID of the country manager to delete.
 * @returns {Promise<void>} 
 */
exports.deleteCountryManagerService = async (id) => {
    try {
        await CountryManager.findByIdAndUpdate(id, { isDeleted: true });
    } catch (error) {
        throw error;
    }
};

const { applyQueryFeatures } = require("../../../shared/utils/queryHelper");

/**
 * Retrieves all Country Managers using generic query features.
 * @param {Object} queryParams - Raw query parameters from req.query.
 * @param {Object} [options={}] - Additional options like baseQuery or overrides.
 * @returns {Promise<Object>} Paginated result
 */
exports.getCountryManagersService = async (queryParams = {}, options = {}) => {
  try {
    const queryOptions = {
        searchFields: ["fullName", "email"],
        filterFields: ["status", "country"],
        dateFilterField: "createdAt",
        ...options
    };

    return await applyQueryFeatures(CountryManager, queryParams, queryOptions);
  } catch (error) {
    throw error;
  }
};

/**
 * Retrieves a single active Country Manager by ID.
 *
 * @param {string} id - The ID of the country manager.
 * @returns {Promise<Object|null>} The Country Manager document if found, else null.
 */
exports.getCountryManagerByIdService = async (id) => {
    try {
        return await CountryManager.findOne({ _id: id, isDeleted: false });
    } catch (error) {
        throw error;
    }
};

/**
 * Authenticates a Country Manager using email and password.
 * @param {string} email - Manager's email address.
 * @param {string} password - Manager's plaintext password.
 * @returns {Promise<Object>} Object containing accessToken and refreshToken.
 * @throws {Error} If credentials are invalid or account is not active.
 */
exports.loginCountryManager = async (email, password) => {
    const manager = await CountryManager.findOne({ email });

    if (!manager) throw new Error("Invalid credentials");

    const isMatch = await bcrypt.compare(password, manager.passwordHash);
    if (!isMatch) throw new Error("Invalid credentials");

    if (manager.status !== "ACTIVE")
        throw new Error("Account not active");

    const accessToken = jwt.sign(
        { id: manager._id, role: manager.role },
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

/**
 * Refreshes the access token using a valid refresh token for Country Manager.
 * @param {string} token - The refresh token.
 * @returns {Promise<Object>} Object containing the new accessToken.
 * @throws {Error} If the refresh token is invalid or does not match the stored token.
 */
exports.refreshAccessToken = async (token) => {
    const decoded = jwt.verify(
        token,
        process.env.JWT_REFRESH_SECRET
    );

    const manager = await CountryManager.findById(decoded.id);

    if (!manager || manager.refreshToken !== token)
        throw new Error("Invalid refresh token");

    const newAccessToken = jwt.sign(
        { id: manager._id, role: manager.role },
        process.env.JWT_SECRET,
        { expiresIn: jwtConfig.accessTokenExpiry }
    );

    return { accessToken: newAccessToken };
};
