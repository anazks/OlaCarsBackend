const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const BranchManager = require("../Model/BranchManagerModel.js");
const { jwtConfig } = require("../../../config/jwtConfig.js");

/**
 * Adds a new Branch Manager to the database.
 * @param {Object} data - Branch Manager details.
 * @returns {Promise<Object>} Added Branch Manager object.
 */
exports.addBranchManagerService = async (data) => {
    try {
        const hashedPassword = await bcrypt.hash(data.password, 12);
        const newManager = await BranchManager.create({
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
 * Updates an existing Branch Manager.
 * @param {Object} data - Updated field details including ID.
 * @returns {Promise<Object>} Updated Branch Manager object.
 */
exports.editBranchManagerService = async (data) => {
    try {
        const { id, ...updateData } = data;
        const updatedManager = await BranchManager.findByIdAndUpdate(id, updateData, { new: true });
        return updatedManager;
    } catch (error) {
        throw error;
    }
};

/**
 * Soft deletes a Branch Manager.
 * @param {string} id - The ID to delete.
 * @returns {Promise<void>}
 */
exports.deleteBranchManagerService = async (id) => {
    try {
        await BranchManager.findByIdAndUpdate(id, { isDeleted: true });
    } catch (error) {
        throw error;
    }
};

const { applyQueryFeatures } = require("../../../shared/utils/queryHelper");

/**
 * Retrieves all Branch Managers using generic query features.
 * @param {Object} queryParams - Raw query parameters from req.query.
 * @param {Object} [options={}] - Additional options like baseQuery or overrides.
 * @returns {Promise<Object>} Paginated result
 */
exports.getBranchManagersService = async (queryParams = {}, options = {}) => {
  try {
    const queryOptions = {
        searchFields: ["fullName", "email"],
        filterFields: ["status", "branchId"],
        ...options
    };

    return await applyQueryFeatures(BranchManager, queryParams, queryOptions);
  } catch (error) {
    throw error;
  }
};

exports.getBranchManagerByIdService = async (id) => {
    try {
        const manager = await BranchManager.findOne({ _id: id, isDeleted: false });
        if (!manager) return null;

        const roleMapping = {
            'ADMIN': 'Admin',
            'OPERATIONADMIN': 'OperationalAdmin',
            'FINANCEADMIN': 'FinanceAdmin',
            'COUNTRYMANAGER': 'CountryManager'
        };

        const modelName = roleMapping[manager.creatorRole];
        if (modelName) {
            await manager.populate({
                path: 'createdBy',
                model: modelName,
                select: 'name fullName email role'
            });
        }

        return manager;
    } catch (error) {
        throw error;
    }
};

exports.loginBranchManager = async (email, password) => {
    const manager = await BranchManager.findOne({ email, isDeleted: false });
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
    await manager.save();

    return { accessToken, refreshToken };
};
