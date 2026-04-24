const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { Driver } = require("../../Driver/Model/DriverModel");
const { jwtConfig  } = require("../../../config/jwtConfig.js");

/**
 * Adds a new driver to the database.
 * @param {Object} data - Driver details.
 * @returns {Promise<Object>} Added Driver object.
 */
exports.addUserService = async (data) => {
    try {
        const hashedPassword = await bcrypt.hash(data.password, 12);
        const newDriver = await Driver.create({
            ...data,
            personalInfo: {
                fullName: data.fullName,
                email: data.email.toLowerCase(),
                phone: data.phone,
            },
            passwordHash: hashedPassword,
            role: "USER",
        });

        return newDriver;
    } catch (error) {
        throw error;
    }
};

/**
 * Updates an existing driver.
 * @param {Object} data - Updated field details including ID.
 * @returns {Promise<Object>} Updated Driver object.
 */
exports.editUserService = async (data) => {
    try {
        const { id, ...updateData } = data;
        const mappedUpdate = {};
        if (updateData.fullName) mappedUpdate["personalInfo.fullName"] = updateData.fullName;
        if (updateData.email) mappedUpdate["personalInfo.email"] = updateData.email.toLowerCase();
        if (updateData.phone) mappedUpdate["personalInfo.phone"] = updateData.phone;
        if (updateData.status) mappedUpdate["status"] = updateData.status;

        return await Driver.findByIdAndUpdate(id, { $set: mappedUpdate }, { new: true });
    } catch (error) {
        throw error;
    }
};

/**
 * Soft deletes a driver.
 * @param {string} id - The default ID to delete.
 * @returns {Promise<void>}
 */
exports.deleteUserService = async (id) => {
    try {
        await Driver.findByIdAndUpdate(id, { isDeleted: true });
    } catch (error) {
        throw error;
    }
};

/**
 * Retrieves all drivers.
 * @returns {Promise<Array>} Array of Drivers.
 */
exports.getUsersService = async () => {
    try {
        return await Driver.find({ isDeleted: false });
    } catch (error) {
        throw error;
    }
};

/**
 * Retrieves a driver by their ID.
 * @param {string} id - Driver's mongo ID.
 * @returns {Promise<Object>} Driver details.
 */
exports.getUserByIdService = async (id) => {
    try {
        return await Driver.findOne({ _id: id, isDeleted: false });
    } catch (error) {
        throw error;
    }
};

/**
 * Logs in a driver.
 * @param {string} email - Email address.
 * @param {string} password - Driver password.
 * @returns {Promise<Object>} Object containing Access & Refresh tokens.
 */
exports.loginUser = async (email, password) => {
    const driver = await Driver.findOne({ "personalInfo.email": email.toLowerCase(), isDeleted: false });
    if (!driver) throw new Error("Invalid credentials");

    const isMatch = await bcrypt.compare(password, driver.passwordHash);
    if (!isMatch) throw new Error("Invalid credentials");
    if (["SUSPENDED", "REJECTED"].includes(driver.status)) throw new Error("Account not active");

    const accessToken = jwt.sign(
        { id: driver._id, role: "USER" },
        process.env.JWT_SECRET,
        { expiresIn: jwtConfig.accessTokenExpiry }
    );

    const refreshToken = jwt.sign(
        { id: driver._id },
        process.env.JWT_REFRESH_SECRET,
        { expiresIn: jwtConfig.refreshTokenExpiry }
    );

    driver.refreshToken = refreshToken;
    driver.lastLoginAt = new Date();
    await driver.save();

    return { accessToken, refreshToken };
};
