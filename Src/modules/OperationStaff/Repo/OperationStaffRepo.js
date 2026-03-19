const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const OperationStaff = require("../Model/OperationStaffModel.js");
const { jwtConfig  } = require("../../../config/jwtConfig.js");

/**
 * Adds a new Operation Staff member.
 * @param {Object} data - Staff details.
 * @returns {Promise<Object>} The added staff record.
 */
exports.addOperationStaffService = async (data) => {
    try {
        const hashedPassword = await bcrypt.hash(data.password, 12);
        const newStaff = await OperationStaff.create({
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
 * Updates an Operation Staff member.
 * @param {Object} data - The updated data including ID.
 * @returns {Promise<Object>} The updated documentation.
 */
exports.editOperationStaffService = async (data) => {
    try {
        const { id, ...updateData } = data;
        return await OperationStaff.findByIdAndUpdate(id, updateData, { new: true });
    } catch (error) {
        throw error;
    }
};

/**
 * Soft deletes an Operation Staff member.
 * @param {string} id - Staff member ID.
 * @returns {Promise<void>}
 */
exports.deleteOperationStaffService = async (id) => {
    try {
        await OperationStaff.findByIdAndUpdate(id, { isDeleted: true });
    } catch (error) {
        throw error;
    }
};

const { applyQueryFeatures } = require("../../../shared/utils/queryHelper");

/**
 * Retrieves all Operation Staff members using generic query features.
 * @param {Object} queryParams - Raw query parameters from req.query.
 * @param {Object} [options={}] - Additional options like baseQuery.
 * @returns {Promise<Object>} Paginated result
 */
exports.getOperationStaffService = async (queryParams = {}, options = {}) => {
    try {
        const queryOptions = {
            searchFields: ["fullName", "email"],
            filterFields: ["status", "branchId"],
            dateFilterField: "createdAt",
            ...options
        };

        return await applyQueryFeatures(OperationStaff, queryParams, queryOptions);
    } catch (error) {
        throw error;
    }
};

/**
 * Retrieves an Operation Staff member by ID.
 * @param {string} id - The Staff member ID.
 * @returns {Promise<Object>}
 */
exports.getOperationStaffByIdService = async (id) => {
    try {
        return await OperationStaff.findOne({ _id: id, isDeleted: false });
    } catch (error) {
        throw error;
    }
};

/**
 * Logs in an Operation Staff member.
 * @param {string} email - Email address.
 * @param {string} password - Password string.
 * @returns {Promise<Object>} Access and Refresh tokens.
 */
exports.loginOperationStaff = async (email, password) => {
    const staff = await OperationStaff.findOne({ email, isDeleted: false });
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
