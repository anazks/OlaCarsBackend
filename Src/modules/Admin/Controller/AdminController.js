
const {
  loginAdmin,
  refreshAccessToken,
  addAdminService,
  editAdminService,
  deleteAdminService,
  getAdminsService,
  getAdminByIdService
} = require('../Repo/AdminRepo.js');
/**
 * Handles Admin login request.
 * @route POST /api/admin/login
 * @access Public
 */
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const tokens = await loginAdmin(email, password);

    return res.status(200).json({
      success: true,
      ...tokens,
    });
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: error.message,
    });
  }
};
/**
 * Handles Admin token refresh request.
 * @route POST /api/admin/refresh
 * @access Public
 */
const refreshToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;

    const newToken = await refreshAccessToken(refreshToken);

    return res.json(newToken);
  } catch (error) {
    return res.status(403).json({
      message: "Invalid refresh token",
    });
  }
};

/**
 * Creates a new Admin.
 * @route POST /api/admin/
 * @access Private
 */
const addAdmin = async (req, res) => {
  try {
    let adminData = req.body;
    adminData.createdBy = req.user.id;
    adminData.creatorRole = req.user.role;

    const newAdmin = await addAdminService(adminData);
    return res.status(201).json({ success: true, data: newAdmin });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Gets all Admins.
 * @route GET /api/admin/
 * @access Private
 */
const getAdmins = async (req, res) => {
  try {
    const admins = await getAdminsService();
    return res.status(200).json({ success: true, data: admins });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Gets an Admin by ID.
 * @route GET /api/admin/:id
 * @access Private
 */
const getAdminById = async (req, res) => {
  try {
    const admin = await getAdminByIdService(req.params.id);
    if (!admin) return res.status(404).json({ success: false, message: "Admin not found" });
    return res.status(200).json({ success: true, data: admin });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Updates an Admin.
 * @route PUT /api/admin/update
 * @access Private
 */
const editAdmin = async (req, res) => {
  try {
    const updatedAdmin = await editAdminService(req.body);
    return res.status(200).json({ success: true, data: updatedAdmin });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Deletes an Admin.
 * @route DELETE /api/admin/:id
 * @access Private
 */
const deleteAdmin = async (req, res) => {
  try {
    await deleteAdminService(req.params.id);
    return res.status(200).json({ success: true, message: "Admin deleted successfully" });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  login,
  refreshToken,
  addAdmin,
  getAdmins,
  getAdminById,
  editAdmin,
  deleteAdmin
};