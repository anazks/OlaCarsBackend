const {
  loginOperationalAdmin,
  refreshAccessTokenOperationalAdmin,
  addOperationalAdminService,
  editOperationalAdminService,
  deleteOperationalAdminService,
  getOperationalAdminsService,
  getOperationalAdminByIdService
} = require('../Repo/OperationAdminRepo.js');
/**
 * Handles Operational Admin login request.
 * @route POST /api/operationaladmin/login
 * @access Public
 */
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const tokens = await loginOperationalAdmin(email, password);

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
 * Handles Operational Admin token refresh request.
 * @route POST /api/operationaladmin/refresh
 * @access Public
 */
const refreshToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;

    const newToken = await refreshAccessTokenOperationalAdmin(refreshToken);

    return res.json(newToken);
  } catch (error) {
    return res.status(403).json({
      message: "Invalid refresh token",
    });
  }
};

/**
 * Creates a new Operational Admin.
 * @route POST /api/operationaladmin/
 * @access Private
 */
const addOperationalAdmin = async (req, res) => {
  try {
    let adminData = req.body;
    adminData.createdBy = req.user.id;
    adminData.creatorRole = req.user.role;

    const newAdmin = await addOperationalAdminService(adminData);
    return res.status(201).json({ success: true, data: newAdmin });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Gets all Operational Admins.
 * @route GET /api/operationaladmin/
 * @access Private
 */
const getOperationalAdmins = async (req, res) => {
  try {
    const admins = await getOperationalAdminsService();
    return res.status(200).json({ success: true, data: admins });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Gets an Operational Admin by ID.
 * @route GET /api/operationaladmin/:id
 * @access Private
 */
const getOperationalAdminById = async (req, res) => {
  try {
    const admin = await getOperationalAdminByIdService(req.params.id);
    if (!admin) return res.status(404).json({ success: false, message: "Operational Admin not found" });
    return res.status(200).json({ success: true, data: admin });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Updates an Operational Admin.
 * @route PUT /api/operationaladmin/update
 * @access Private
 */
const editOperationalAdmin = async (req, res) => {
  try {
    const updatedAdmin = await editOperationalAdminService(req.body);
    return res.status(200).json({ success: true, data: updatedAdmin });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Deletes an Operational Admin.
 * @route DELETE /api/operationaladmin/:id
 * @access Private
 */
const deleteOperationalAdmin = async (req, res) => {
  try {
    await deleteOperationalAdminService(req.params.id);
    return res.status(200).json({ success: true, message: "Operational Admin deleted successfully" });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  login,
  refreshToken,
  addOperationalAdmin,
  getOperationalAdmins,
  getOperationalAdminById,
  editOperationalAdmin,
  deleteOperationalAdmin
};
