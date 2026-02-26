const {
  loginFinanceAdmin,
  refreshAccessTokenFinanceAdmin,
  addFinanceAdminService,
  editFinanceAdminService,
  deleteFinanceAdminService,
  getFinanceAdminsService,
  getFinanceAdminByIdService
} = require('../Repo/FinanceAdminRepo.js');
/**
 * Handles Finance Admin login request.
 * @route POST /api/financeadmin/login
 * @access Public
 */
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const tokens = await loginFinanceAdmin(email, password);

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
 * Handles Finance Admin token refresh request.
 * @route POST /api/financeadmin/refresh
 * @access Public
 */
const refreshToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;

    const newToken = await refreshAccessTokenFinanceAdmin(refreshToken);

    return res.json(newToken);
  } catch (error) {
    return res.status(403).json({
      message: "Invalid refresh token",
    });
  }
};

/**
 * Creates a new Finance Admin.
 * @route POST /api/financeadmin/
 * @access Private
 */
const addFinanceAdmin = async (req, res) => {
  try {
    let adminData = req.body;
    adminData.createdBy = req.user.id;
    adminData.creatorRole = req.user.role;

    const newAdmin = await addFinanceAdminService(adminData);
    return res.status(201).json({ success: true, data: newAdmin });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Gets all Finance Admins.
 * @route GET /api/financeadmin/
 * @access Private
 */
const getFinanceAdmins = async (req, res) => {
  try {
    const admins = await getFinanceAdminsService();
    return res.status(200).json({ success: true, data: admins });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Gets a Finance Admin by ID.
 * @route GET /api/financeadmin/:id
 * @access Private
 */
const getFinanceAdminById = async (req, res) => {
  try {
    const admin = await getFinanceAdminByIdService(req.params.id);
    if (!admin) return res.status(404).json({ success: false, message: "Finance Admin not found" });
    return res.status(200).json({ success: true, data: admin });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Updates a Finance Admin.
 * @route PUT /api/financeadmin/update
 * @access Private
 */
const editFinanceAdmin = async (req, res) => {
  try {
    const updatedAdmin = await editFinanceAdminService(req.body);
    return res.status(200).json({ success: true, data: updatedAdmin });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Deletes a Finance Admin.
 * @route DELETE /api/financeadmin/:id
 * @access Private
 */
const deleteFinanceAdmin = async (req, res) => {
  try {
    await deleteFinanceAdminService(req.params.id);
    return res.status(200).json({ success: true, message: "Finance Admin deleted successfully" });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  login,
  refreshToken,
  addFinanceAdmin,
  getFinanceAdmins,
  getFinanceAdminById,
  editFinanceAdmin,
  deleteFinanceAdmin
};
