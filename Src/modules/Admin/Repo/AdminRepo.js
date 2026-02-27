const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const Admin = require("../model/adminModel.js");
const { jwtConfig } = require('../../../config/jwtConfig.js');


/**
 * Authenticates an Admin using email and password.
 * @param {string} email - Admin's email address.
 * @param {string} password - Admin's plaintext password.
 * @returns {Promise<Object>} Object containing accessToken and refreshToken.
 * @throws {Error} If credentials are invalid or account is not active.
 */
exports.loginAdmin = async (email, password) => {
  
  const admin = await Admin.findOne({ email});

  if (!admin) throw new Error("Invalid credentials");

  const isMatch = await bcrypt.compare(password, admin.passwordHash);
  if (!isMatch) throw new Error("Invalid credentials");

  if (admin.status !== "ACTIVE")
    throw new Error("Account not active");

  const accessToken = jwt.sign(
    { id: admin._id, role: admin.role },
    process.env.JWT_SECRET,
    { expiresIn: jwtConfig.accessTokenExpiry }
  );

  const refreshToken = jwt.sign(
    { id: admin._id },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: jwtConfig.refreshTokenExpiry }
  );

  admin.refreshToken = refreshToken;
  await admin.save();

  return { accessToken, refreshToken };
};

/**
 * Refreshes the access token using a valid refresh token.
 * @param {string} token - The refresh token.
 * @returns {Promise<Object>} Object containing the new accessToken.
 * @throws {Error} If the refresh token is invalid or does not match the stored token.
 */
exports.refreshAccessToken = async (token) => {
  const decoded = jwt.verify(
    token,
    process.env.JWT_REFRESH_SECRET
  );

  const admin = await Admin.findById(decoded.id);

  if (!admin || admin.refreshToken !== token)
    throw new Error("Invalid refresh token");

  const newAccessToken = jwt.sign(
    { id: admin._id, role: admin.role },
    process.env.JWT_SECRET,
    { expiresIn: jwtConfig.accessTokenExpiry }
  );

  return { accessToken: newAccessToken };
};

/**
 * Adds a new Admin to the database.
 * @param {Object} data - Admin details.
 * @returns {Promise<Object>} Added Admin object.
 */
exports.addAdminService = async (data) => {
  try {
    const hashedPassword = await bcrypt.hash(data.password, 12);
    const newAdmin = await Admin.create({
      ...data,
      passwordHash: hashedPassword,
    });

    const adminObj = newAdmin.toObject();
    delete adminObj.passwordHash;

    return adminObj;
  } catch (error) {
    throw error;
  }
};

/**
 * Updates an existing Admin.
 * @param {Object} data - Updated field details including ID.
 * @returns {Promise<Object>} Updated Admin object.
 */
exports.editAdminService = async (data) => {
  try {
    const { id, ...updateData } = data;
    return await Admin.findByIdAndUpdate(id, updateData, { new: true });
  } catch (error) {
    throw error;
  }
};

/**
 * Soft deletes an Admin.
 * @param {string} id - The ID to delete.
 * @returns {Promise<void>}
 */
exports.deleteAdminService = async (id) => {
  try {
    await Admin.findByIdAndUpdate(id, { isDeleted: true });
  } catch (error) {
    throw error;
  }
};

/**
 * Retrieves all Admins.
 * @returns {Promise<Array>} Array of Admins.
 */
exports.getAdminsService = async () => {
  try {
    return await Admin.find({ isDeleted: false });
  } catch (error) {
    throw error;
  }
};

/**
 * Retrieves an Admin by their ID.
 * @param {string} id - Admin's mongo ID.
 * @returns {Promise<Object>} Admin details.
 */
exports.getAdminByIdService = async (id) => {
  try {
    return await Admin.findOne({ _id: id, isDeleted: false });
  } catch (error) {
    throw error;
  }
};