const OperationAdminService = require('../Service/OperationAdminService.js');

const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const tokens = await OperationAdminService.login(email, password);
    return res.status(200).json({ success: true, ...tokens });
  } catch (error) {
    const statusCode = error.statusCode || 401;
    return res.status(statusCode).json({ success: false, message: error.message });
  }
};

const refreshToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    const newToken = await OperationAdminService.refreshAccessToken(refreshToken);
    return res.json(newToken);
  } catch (error) {
    return res.status(403).json({ message: 'Invalid refresh token' });
  }
};

const addOperationalAdmin = async (req, res) => {
  try {
    const adminData = { ...req.body };
    adminData.createdBy = req.user.id;
    adminData.creatorRole = req.user.role;
    const newAdmin = await OperationAdminService.create(adminData);
    return res.status(201).json({ success: true, data: newAdmin });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({ success: false, message: error.message });
  }
};

const getOperationalAdmins = async (req, res) => {
  try {
    const result = await OperationAdminService.getAll(req.query);
    return res.status(200).json({ 
      success: true, 
      data: result.data,
      pagination: {
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages: result.totalPages
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const getOperationalAdminById = async (req, res) => {
  try {
    const admin = await OperationAdminService.getById(req.params.id);
    if (!admin) return res.status(404).json({ success: false, message: 'Operational Admin not found' });
    return res.status(200).json({ success: true, data: admin });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const editOperationalAdmin = async (req, res) => {
  try {
    const updatedAdmin = await OperationAdminService.update(req.params.id, req.body);
    return res.status(200).json({ success: true, data: updatedAdmin });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({ success: false, message: error.message });
  }
};

const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const result = await OperationAdminService.changePassword(req.params.id, currentPassword, newPassword);
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({ success: false, message: error.message });
  }
};

const deleteOperationalAdmin = async (req, res) => {
  try {
    await OperationAdminService.remove(req.params.id);
    return res.status(200).json({ success: true, message: 'Operational Admin deleted successfully' });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({ success: false, message: error.message });
  }
};

module.exports = {
  login,
  refreshToken,
  addOperationalAdmin,
  getOperationalAdmins,
  getOperationalAdminById,
  editOperationalAdmin,
  changePassword,
  deleteOperationalAdmin
};
