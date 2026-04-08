const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const WorkshopManager = require("../Model/WorkshopManagerModel.js");
const { jwtConfig } = require("../../../config/jwtConfig.js");
const { applyQueryFeatures } = require("../../../shared/utils/queryHelper");

/**
 * Adds a new Workshop Manager to the database.
 * @param {Object} data - Workshop Manager details.
 * @returns {Promise<Object>} Added Workshop Manager object.
 */
exports.addWorkshopManagerRepo = async (data) => {
    try {
        const hashedPassword = await bcrypt.hash(data.password, 12);
        const newManager = await WorkshopManager.create({
            ...data,
            passwordHash: hashedPassword,
        });

        // Remove password hash from response
        const managerObj = newManager.toObject();
        delete managerObj.passwordHash;

        return managerObj;
    } catch (error) {
        throw error;
    }
};

/**
 * Updates an existing Workshop Manager.
 * @param {Object} data - Updated field details including ID.
 * @returns {Promise<Object>} Updated Workshop Manager object.
 */
exports.editWorkshopManagerRepo = async (data) => {
    try {
        const { id, ...updateData } = data;
        const updatedManager = await WorkshopManager.findByIdAndUpdate(id, updateData, { new: true });
        return updatedManager;
    } catch (error) {
        throw error;
    }
};

/**
 * Soft deletes a Workshop Manager.
 * @param {string} id - The ID to delete.
 * @returns {Promise<void>}
 */
exports.deleteWorkshopManagerRepo = async (id) => {
    try {
        await WorkshopManager.findByIdAndUpdate(id, { isDeleted: true });
    } catch (error) {
        throw error;
    }
};

/**
 * Retrieves all Workshop Managers using generic query features.
 * @param {Object} queryParams - Raw query parameters from req.query.
 * @param {Object} [options={}] - Additional options like baseQuery.
 * @returns {Promise<Object>} Paginated result
 */
exports.getWorkshopManagersRepo = async (queryParams = {}, options = {}) => {
  try {
    const queryOptions = {
        searchFields: ["fullName", "email"],
        filterFields: ["status", "branchId"],
        dateFilterField: "createdAt",
        ...options
    };

    return await applyQueryFeatures(WorkshopManager, queryParams, queryOptions);
  } catch (error) {
    throw error;
  }
};

/**
 * Retrieves a Workshop Manager by ID.
 * @param {string} id - The ID.
 * @returns {Promise<Object>}
 */
exports.getWorkshopManagerByIdRepo = async (id) => {
    try {
        return await WorkshopManager.findById(id).select("-passwordHash");
    } catch (error) {
        throw error;
    }
};

/**
 * Handles Workshop Manager login.
 * @param {string} email - Email address.
 * @param {string} password - Password.
 * @returns {Promise<Object>} Tokens and manager object.
 */
exports.loginWorkshopManagerRepo = async (email, password) => {
    const manager = await WorkshopManager.findOne({ email, isDeleted: false });
    if (!manager) throw new Error("Invalid credentials");

    const isMatch = await bcrypt.compare(password, manager.passwordHash);
    if (!isMatch) throw new Error("Invalid credentials");
    if (manager.status !== "ACTIVE") throw new Error("Account not active");

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
    manager.lastLoginAt = new Date();
    await manager.save();

    return { manager, accessToken, refreshToken };
};
