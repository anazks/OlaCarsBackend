const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const FinanceAdmin = require("../model/FinanceAdminModel.js");
const { jwtConfig } = require('../../../config/jwtConfig.js');


/**
 * Authenticates a Finance Admin using email and password.
 * @param {string} email - Finance Admin's email address.
 * @param {string} password - Finance Admin's plaintext password.
 * @returns {Promise<Object>} Object containing accessToken and refreshToken.
 * @throws {Error} If credentials are invalid or account is not active.
 */
exports.loginFinanceAdmin = async (email, password) => {
  const financeAdmin = await FinanceAdmin.findOne({ email, isDeleted: false });

  if (!financeAdmin) throw new Error("Invalid credentials");

  const isMatch = await bcrypt.compare(password, financeAdmin.passwordHash);
  if (!isMatch) throw new Error("Invalid credentials");

  if (financeAdmin.status !== "ACTIVE")
    throw new Error("Account not active");

  const accessToken = jwt.sign(
    { id: financeAdmin._id, role: financeAdmin.role },
    process.env.JWT_SECRET,
    { expiresIn: jwtConfig.accessTokenExpiry }
  );

  const refreshToken = jwt.sign(
    { id: financeAdmin._id },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: jwtConfig.refreshTokenExpiry }
  );

  financeAdmin.refreshToken = refreshToken;
  await financeAdmin.save();

  return { accessToken, refreshToken };
};

/**
 * Refreshes the access token using a valid refresh token.
 * @param {string} token - The refresh token.
 * @returns {Promise<Object>} Object containing the new accessToken.
 * @throws {Error} If the refresh token is invalid or does not match the stored token.
 */
exports.refreshAccessTokenFinanceAdmin = async (token) => {
  const decoded = jwt.verify(
    token,
    process.env.JWT_REFRESH_SECRET
  );

  const financeAdmin = await FinanceAdmin.findById(decoded.id);

  if (!financeAdmin || financeAdmin.refreshToken !== token)
    throw new Error("Invalid refresh token");

  const newAccessToken = jwt.sign(
    { id: financeAdmin._id, role: financeAdmin.role },
    process.env.JWT_SECRET,
    { expiresIn: jwtConfig.accessTokenExpiry }
  );

  return { accessToken: newAccessToken };
};

/**
 * Adds a new Finance Admin.
 * @param {Object} data - Admin details.
 * @returns {Promise<Object>} Added Admin object.
 */
exports.addFinanceAdminService = async (data) => {
  try {
    const hashedPassword = await bcrypt.hash(data.password, 12);
    const newAdmin = await FinanceAdmin.create({
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
 * Updates a Finance Admin.
 * @param {Object} data - Updated field details including ID.
 * @returns {Promise<Object>} Updated Admin object.
 */
exports.editFinanceAdminService = async (data) => {
  try {
    const { id, ...updateData } = data;
    return await FinanceAdmin.findByIdAndUpdate(id, updateData, { new: true });
  } catch (error) {
    throw error;
  }
};

/**
 * Soft deletes a Finance Admin.
 * @param {string} id - The ID to delete.
 */
exports.deleteFinanceAdminService = async (id) => {
  try {
    await FinanceAdmin.findByIdAndUpdate(id, { isDeleted: true });
  } catch (error) {
    throw error;
  }
};

const { applyQueryFeatures } = require("../../../shared/utils/queryHelper");

/**
 * Retrieves all Finance Admins using generic query features.
 * @param {Object} queryParams - Raw query parameters from req.query.
 * @param {Object} [options={}] - Additional options like baseQuery or overrides.
 * @returns {Promise<Object>} Paginated result
 */
exports.getFinanceAdminsService = async (queryParams = {}, options = {}) => {
  try {
    const queryOptions = {
      searchFields: ["fullName", "email"],
      filterFields: ["status", "role"],
      dateFilterField: "createdAt",
      ...options
    };

    return await applyQueryFeatures(FinanceAdmin, queryParams, queryOptions);
  } catch (error) {
    throw error;
  }
};

/**
 * Retrieves a Finance Admin by ID.
 * @param {string} id
 * @returns {Promise<Object>}
 */
exports.getFinanceAdminByIdService = async (id) => {
  try {
    return await FinanceAdmin.findOne({ _id: id, isDeleted: false });
  } catch (error) {
    throw error;
  }
};
