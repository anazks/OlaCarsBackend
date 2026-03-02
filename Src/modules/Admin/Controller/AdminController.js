const AdminService = require('../Service/AdminService.js');

/**
 * Handles Admin login request.
 * @route POST /api/admin/login
 */
const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const tokens = await AdminService.login(email, password);
    return res.status(200).json({ success: true, ...tokens });
  } catch (error) {
    const statusCode = error.statusCode || 401;
    return res.status(statusCode).json({ success: false, message: error.message });
  }
};

/**
 * Handles Admin token refresh request.
 * @route POST /api/admin/refresh
 */
const refreshToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    const newToken = await AdminService.refreshAccessToken(refreshToken);
    return res.json(newToken);
  } catch (error) {
    return res.status(403).json({ message: 'Invalid refresh token' });
  }
};

/**
 * Creates a new Admin.
 * @route POST /api/admin/
 */
const addAdmin = async (req, res) => {
  try {
    const adminData = { ...req.body };
    adminData.createdBy = req.user.id;
    adminData.creatorRole = req.user.role;
    const newAdmin = await AdminService.create(adminData);
    return res.status(201).json({ success: true, data: newAdmin });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({ success: false, message: error.message });
  }
};

/**
 * Gets all Admins.
 * @route GET /api/admin/
 */
const getAdmins = async (req, res) => {
  try {
    const admins = await AdminService.getAll();
    return res.status(200).json({ success: true, data: admins });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Gets an Admin by ID.
 * @route GET /api/admin/:id
 */
const getAdminById = async (req, res) => {
  try {
    const admin = await AdminService.getById(req.params.id);
    if (!admin) return res.status(404).json({ success: false, message: 'Admin not found' });
    return res.status(200).json({ success: true, data: admin });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Updates an Admin (whitelisted fields only).
 * @route PUT /api/admin/:id
 */
const editAdmin = async (req, res) => {
  try {
    const updatedAdmin = await AdminService.update(req.params.id, req.body);
    return res.status(200).json({ success: true, data: updatedAdmin });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({ success: false, message: error.message });
  }
};

/**
 * Changes Admin password.
 * @route POST /api/admin/:id/change-password
 */
const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const result = await AdminService.changePassword(req.params.id, currentPassword, newPassword);
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({ success: false, message: error.message });
  }
};

/**
 * Deletes an Admin.
 * @route DELETE /api/admin/:id
 */
const deleteAdmin = async (req, res) => {
  try {
    await AdminService.remove(req.params.id);
    return res.status(200).json({ success: true, message: 'Admin deleted successfully' });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({ success: false, message: error.message });
  }
};

module.exports = {
  login,
  refreshToken,
  addAdmin,
  getAdmins,
  getAdminById,
  editAdmin,
  changePassword,
  deleteAdmin
};