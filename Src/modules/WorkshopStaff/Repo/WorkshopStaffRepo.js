const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const WorkshopStaff = require("../Model/WorkshopStaffModel.js");
const { jwtConfig  } = require("../../../config/jwtConfig.js");

/**
 * Adds a new Workshop Staff member.
 * @param {Object} data - Staff details.
 * @returns {Promise<Object>} Added staff document.
 */
exports.addWorkshopStaffService = async (data) => {
    try {
        const hashedPassword = await bcrypt.hash(data.password, 12);
        const newStaff = await WorkshopStaff.create({
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
 * Updates a Workshop Staff member.
 * @param {Object} data - Update payload containing ID.
 * @returns {Promise<Object>} Updated staff document.
 */
exports.editWorkshopStaffService = async (data) => {
    try {
        const { id, ...updateData } = data;
        return await WorkshopStaff.findByIdAndUpdate(id, updateData, { new: true });
    } catch (error) {
        throw error;
    }
};

/**
 * Soft deletes a Workshop Staff member.
 * @param {string} id - ID to delete.
 * @returns {Promise<void>}
 */
exports.deleteWorkshopStaffService = async (id) => {
    try {
        await WorkshopStaff.findByIdAndUpdate(id, { isDeleted: true });
    } catch (error) {
        throw error;
    }
};

/**
 * Retrieves all Workshop Staff members.
 * @returns {Promise<Array>}
 */
exports.getWorkshopStaffService = async () => {
    try {
        return await WorkshopStaff.find({ isDeleted: false });
    } catch (error) {
        throw error;
    }
};

/**
 * Retrieves a Workshop Staff member by ID.
 * @param {string} id - The ID.
 * @returns {Promise<Object>}
 */
exports.getWorkshopStaffByIdService = async (id) => {
    try {
        return await WorkshopStaff.findOne({ _id: id, isDeleted: false });
    } catch (error) {
        throw error;
    }
};

/**
 * Handles Workshop Staff login.
 * @param {string} email - Email address.
 * @param {string} password - Password.
 * @returns {Promise<Object>} Tokens.
 */
exports.loginWorkshopStaff = async (email, password) => {
    const staff = await WorkshopStaff.findOne({ email, isDeleted: false });
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
