const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../Model/UserModel.js");
const { jwtConfig  } = require("../../../config/jwtConfig.js");

/**
 * Adds a new user to the database.
 * @param {Object} data - User details.
 * @returns {Promise<Object>} Added User object.
 */
exports.addUserService = async (data) => {
    try {
        const hashedPassword = await bcrypt.hash(data.password, 12);
        const newUser = await User.create({
            ...data,
            passwordHash: hashedPassword,
        });

        const userObj = newUser.toObject();
        delete userObj.passwordHash;

        return userObj;
    } catch (error) {
        throw error;
    }
};

/**
 * Updates an existing user.
 * @param {Object} data - Updated field details including ID.
 * @returns {Promise<Object>} Updated User object.
 */
exports.editUserService = async (data) => {
    try {
        const { id, ...updateData } = data;
        return await User.findByIdAndUpdate(id, updateData, { new: true });
    } catch (error) {
        throw error;
    }
};

/**
 * Soft deletes a user.
 * @param {string} id - The default ID to delete.
 * @returns {Promise<void>}
 */
exports.deleteUserService = async (id) => {
    try {
        await User.findByIdAndUpdate(id, { isDeleted: true });
    } catch (error) {
        throw error;
    }
};

/**
 * Retrieves all users.
 * @returns {Promise<Array>} Array of Users.
 */
exports.getUsersService = async () => {
    try {
        return await User.find({ isDeleted: false });
    } catch (error) {
        throw error;
    }
};

/**
 * Retrieves a user by their ID.
 * @param {string} id - User's mongo ID.
 * @returns {Promise<Object>} User details.
 */
exports.getUserByIdService = async (id) => {
    try {
        return await User.findOne({ _id: id, isDeleted: false });
    } catch (error) {
        throw error;
    }
};

/**
 * Logs in a user.
 * @param {string} email - Email address.
 * @param {string} password - User password.
 * @returns {Promise<Object>} Object containing Access & Refresh tokens.
 */
exports.loginUser = async (email, password) => {
    const user = await User.findOne({ email, isDeleted: false });
    if (!user) throw new Error("Invalid credentials");

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) throw new Error("Invalid credentials");
    if (user.status !== "ACTIVE") throw new Error("Account not active");

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
    user.lastLoginAt = new Date();
    await user.save();

    return { accessToken, refreshToken };
};
