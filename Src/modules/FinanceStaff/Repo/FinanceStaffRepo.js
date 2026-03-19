const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const FinanceStaff = require("../Model/FinanceStaffModel.js");
const { jwtConfig  } = require("../../../config/jwtConfig.js");

/**
 * Adds a new Finance Staff member.
 * @param {Object} data - Staff details.
 * @returns {Promise<Object>} Added staff document.
 */
exports.addFinanceStaffService = async (data) => {
    try {
        const hashedPassword = await bcrypt.hash(data.password, 12);
        const newStaff = await FinanceStaff.create({
            ...data,
            passwordHash: hashedPassword,
        });

        const staffObj = newStaff.toObject();
        delete staffObj.passwordHash;

        return staffObj;
    } catch (error) {
        throw error;
    }
};

/**
 * Updates a Finance Staff member.
 * @param {Object} data - Update payload containing ID.
 * @returns {Promise<Object>} Updated staff document.
 */
exports.editFinanceStaffService = async (data) => {
    try {
        const { id, ...updateData } = data;
        return await FinanceStaff.findByIdAndUpdate(id, updateData, { new: true });
    } catch (error) {
        throw error;
    }
};

/**
 * Soft deletes a Finance Staff member.
 * @param {string} id - ID to delete.
 * @returns {Promise<void>}
 */
exports.deleteFinanceStaffService = async (id) => {
    try {
        await FinanceStaff.findByIdAndUpdate(id, { isDeleted: true });
    } catch (error) {
        throw error;
    }
};

const { applyQueryFeatures } = require("../../../shared/utils/queryHelper");

/**
 * Retrieves all Finance Staff members using generic query features.
 * @param {Object} queryParams - Raw query parameters from req.query.
 * @param {Object} [options={}] - Additional options like baseQuery.
 * @returns {Promise<Object>} Paginated result
 */
exports.getFinanceStaffService = async (queryParams = {}, options = {}) => {
    try {
        const queryOptions = {
            searchFields: ["fullName", "email"],
            filterFields: ["status", "branchId"],
            dateFilterField: "createdAt",
            ...options
        };

        return await applyQueryFeatures(FinanceStaff, queryParams, queryOptions);
    } catch (error) {
        throw error;
    }
};

/**
 * Retrieves a Finance Staff member by ID.
 * @param {string} id - The ID.
 * @returns {Promise<Object>}
 */
exports.getFinanceStaffByIdService = async (id) => {
    try {
        return await FinanceStaff.findOne({ _id: id, isDeleted: false });
    } catch (error) {
        throw error;
    }
};

/**
 * Handles Finance Staff login.
 * @param {string} email - Email address.
 * @param {string} password - Password.
 * @returns {Promise<Object>} Tokens.
 */
exports.loginFinanceStaff = async (email, password) => {
    const staff = await FinanceStaff.findOne({ email, isDeleted: false });
    if (!staff) throw new Error("Invalid credentials");

    const isMatch = await bcrypt.compare(password, staff.passwordHash);
    if (!isMatch) throw new Error("Invalid credentials");
    if (staff.status !== "ACTIVE") throw new Error("Account not active");

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
    staff.lastLoginAt = new Date();
    await staff.save();

    return { accessToken, refreshToken };
};
