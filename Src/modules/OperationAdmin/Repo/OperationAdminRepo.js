const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const OperationalAdmin = require("../model/OperationAdminModel.js");
const { jwtConfig } = require('../../../config/jwtConfig.js');


/**
 * Authenticates an Operational Admin using email and password.
 * @param {string} email - Operational Admin's email address.
 * @param {string} password - Operational Admin's plaintext password.
 * @returns {Promise<Object>} Object containing accessToken and refreshToken.
 * @throws {Error} If credentials are invalid or account is not active.
 */
exports.loginOperationalAdmin = async (email, password) => {
  const operationalAdmin = await OperationalAdmin.findOne({ email, isDeleted: false });

  if (!operationalAdmin) throw new Error("Invalid credentials");

  const isMatch = await bcrypt.compare(password, operationalAdmin.passwordHash);
  if (!isMatch) throw new Error("Invalid credentials");

  if (operationalAdmin.status !== "ACTIVE")
    throw new Error("Account not active");

  const accessToken = jwt.sign(
    { id: operationalAdmin._id, role: operationalAdmin.role },
    process.env.JWT_SECRET,
    { expiresIn: jwtConfig.accessTokenExpiry }
  );

  const refreshToken = jwt.sign(
    { id: operationalAdmin._id },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: jwtConfig.refreshTokenExpiry }
  );

  operationalAdmin.refreshToken = refreshToken;
  await operationalAdmin.save();

  return { accessToken, refreshToken };
};

/**
 * Refreshes the access token using a valid refresh token.
 * @param {string} token - The refresh token.
 * @returns {Promise<Object>} Object containing the new accessToken.
 * @throws {Error} If the refresh token is invalid or does not match the stored token.
 */
exports.refreshAccessTokenOperationalAdmin = async (token) => {
  const decoded = jwt.verify(
    token,
    process.env.JWT_REFRESH_SECRET
  );

  const operationalAdmin = await OperationalAdmin.findById(decoded.id);

  if (!operationalAdmin || operationalAdmin.refreshToken !== token)
    throw new Error("Invalid refresh token");

  const newAccessToken = jwt.sign(
    { id: operationalAdmin._id, role: operationalAdmin.role },
    process.env.JWT_SECRET,
    { expiresIn: jwtConfig.accessTokenExpiry }
  );

  return { accessToken: newAccessToken };
};

/**
 * Adds a new Operational Admin.
 * @param {Object} data - Admin details.
 * @returns {Promise<Object>} Added Admin object.
 */
exports.addOperationalAdminService = async (data) => {
  try {
    const hashedPassword = await bcrypt.hash(data.password, 12);
    const newAdmin = await OperationalAdmin.create({
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
 * Updates an Operational Admin.
 * @param {Object} data - Updated field details including ID.
 * @returns {Promise<Object>} Updated Admin object.
 */
exports.editOperationalAdminService = async (data) => {
  try {
    const { id, ...updateData } = data;
    return await OperationalAdmin.findByIdAndUpdate(id, updateData, { new: true });
  } catch (error) {
    throw error;
  }
};

/**
 * Soft deletes an Operational Admin.
 * @param {string} id - The ID to delete.
 */
exports.deleteOperationalAdminService = async (id) => {
  try {
    await OperationalAdmin.findByIdAndUpdate(id, { isDeleted: true });
  } catch (error) {
    throw error;
  }
};

const { applyQueryFeatures } = require("../../../shared/utils/queryHelper");

/**
 * Retrieves all Operational Admins using generic query features.
 * @param {Object} queryParams - Raw query parameters from req.query.
 * @param {Object} [options={}] - Additional options like baseQuery or overrides.
 * @returns {Promise<Object>} Paginated result
 */
exports.getOperationalAdminsService = async (queryParams = {}, options = {}) => {
  try {
    const queryOptions = {
      searchFields: ["fullName", "email"],
      filterFields: ["status", "role"],
      ...options
    };

    return await applyQueryFeatures(OperationalAdmin, queryParams, queryOptions);
  } catch (error) {
    throw error;
  }
};

/**
 * Retrieves an Operational Admin by ID.
 * @param {string} id
 * @returns {Promise<Object>}
 */
exports.getOperationalAdminByIdService = async (id) => {
  try {
    return await OperationalAdmin.findOne({ _id: id, isDeleted: false });
  } catch (error) {
    throw error;
  }
};
