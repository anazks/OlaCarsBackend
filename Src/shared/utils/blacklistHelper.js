const BlacklistedToken = require("../models/BlacklistedToken");
const jwt = require("jsonwebtoken");

/**
 * Checks if a token is blacklisted.
 * @param {string} token
 * @returns {Promise<boolean>}
 */
exports.isTokenBlacklisted = async (token) => {
  if (!token) return false;
  const blacklisted = await BlacklistedToken.findOne({ token });
  return !!blacklisted;
};

/**
 * Blacklists a token.
 * @param {string} token
 * @returns {Promise<void>}
 */
exports.blacklistToken = async (token) => {
  if (!token) return;
  try {
    const decoded = jwt.decode(token);
    // Use token exp time, or fallback to 7 days from now (matching our refresh expiry)
    const expiresAt = decoded && decoded.exp ? new Date(decoded.exp * 1000) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    
    await BlacklistedToken.create({ token, expiresAt });
  } catch (error) {
    // Ignore duplicate key error (code 11000) if token is already blacklisted
    if (error.code !== 11000) {
      console.error("Failed to blacklist token:", error);
    }
  }
};
