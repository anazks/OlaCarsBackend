const FinanceAdminService = require('../Service/FinanceAdminService.js');

const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const tokens = await FinanceAdminService.login(email, password);
    return res.status(200).json({ success: true, ...tokens });
  } catch (error) {
    const statusCode = error.statusCode || 401;
    return res.status(statusCode).json({ success: false, message: error.message });
  }
};

const refreshToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    const newToken = await FinanceAdminService.refreshAccessToken(refreshToken);
    return res.json(newToken);
  } catch (error) {
    return res.status(403).json({ message: 'Invalid refresh token' });
  }
};

const addFinanceAdmin = async (req, res) => {
  try {
    const data = { ...req.body };
    data.createdBy = req.user.id;
    data.creatorRole = req.user.role;
    const newAdmin = await FinanceAdminService.create(data);
    return res.status(201).json({ success: true, data: newAdmin });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({ success: false, message: error.message });
  }
};

const getFinanceAdmins = async (req, res) => {
  try {
    const admins = await FinanceAdminService.getAll();
    return res.status(200).json({ success: true, data: admins });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const getFinanceAdminById = async (req, res) => {
  try {
    const admin = await FinanceAdminService.getById(req.params.id);
    if (!admin) return res.status(404).json({ success: false, message: 'Finance Admin not found' });
    return res.status(200).json({ success: true, data: admin });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const editFinanceAdmin = async (req, res) => {
  try {
    const updatedAdmin = await FinanceAdminService.update(req.params.id, req.body);
    return res.status(200).json({ success: true, data: updatedAdmin });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({ success: false, message: error.message });
  }
};

const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const result = await FinanceAdminService.changePassword(req.params.id, currentPassword, newPassword);
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({ success: false, message: error.message });
  }
};

const deleteFinanceAdmin = async (req, res) => {
  try {
    await FinanceAdminService.remove(req.params.id);
    return res.status(200).json({ success: true, message: 'Finance Admin deleted successfully' });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({ success: false, message: error.message });
  }
};

module.exports = {
  login,
  refreshToken,
  addFinanceAdmin,
  getFinanceAdmins,
  getFinanceAdminById,
  editFinanceAdmin,
  changePassword,
  deleteFinanceAdmin
};
