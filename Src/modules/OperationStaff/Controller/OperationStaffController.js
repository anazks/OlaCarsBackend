const OperationStaffService = require('../Service/OperationStaffService.js');

const login = async (req, res) => {
    try {
        const { email, password } = req.body;
        const tokens = await OperationStaffService.login(email, password);
        return res.status(200).json({ success: true, ...tokens });
    } catch (error) {
        const statusCode = error.statusCode || 401;
        return res.status(statusCode).json({ success: false, message: error.message });
    }
};

const addOperationStaff = async (req, res) => {
    try {
        const data = { ...req.body };
        data.createdBy = req.user.id;
        data.creatorRole = req.user.role;
        const newStaff = await OperationStaffService.create(data);
        return res.status(201).json({ success: true, data: newStaff });
    } catch (error) {
        const statusCode = error.statusCode || 500;
        return res.status(statusCode).json({ success: false, message: error.message });
    }
};

const getOperationStaff = async (req, res) => {
    try {
        const staff = await OperationStaffService.getAll();
        return res.status(200).json({ success: true, data: staff });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

const getOperationStaffById = async (req, res) => {
    try {
        const staff = await OperationStaffService.getById(req.params.id);
        if (!staff) return res.status(404).json({ success: false, message: 'Operation Staff not found' });
        return res.status(200).json({ success: true, data: staff });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

const editOperationStaff = async (req, res) => {
    try {
        const updatedStaff = await OperationStaffService.update(req.params.id, req.body);
        return res.status(200).json({ success: true, data: updatedStaff });
    } catch (error) {
        const statusCode = error.statusCode || 500;
        return res.status(statusCode).json({ success: false, message: error.message });
    }
};

const changePassword = async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        const result = await OperationStaffService.changePassword(req.params.id, currentPassword, newPassword);
        return res.status(200).json({ success: true, ...result });
    } catch (error) {
        const statusCode = error.statusCode || 500;
        return res.status(statusCode).json({ success: false, message: error.message });
    }
};

const deleteOperationStaff = async (req, res) => {
    try {
        await OperationStaffService.remove(req.params.id);
        return res.status(200).json({ success: true, message: 'Operation Staff deleted successfully' });
    } catch (error) {
        const statusCode = error.statusCode || 500;
        return res.status(statusCode).json({ success: false, message: error.message });
    }
};

const refreshStaffToken = async (req, res) => {
    try {
        const { token } = req.body;
        if (!token) throw new AppError('Refresh token is required', 400);

        const tokens = await OperationStaffService.refreshSession(token);
        return res.status(200).json({ success: true, ...tokens });
    } catch (error) {
        const statusCode = error.statusCode || 401;
        return res.status(statusCode).json({ success: false, message: error.message });
    }
};

module.exports = {
    login,
    addOperationStaff,
    getOperationStaff,
    getOperationStaffById,
    editOperationStaff,
    changePassword,
    deleteOperationStaff,
    refreshStaffToken
};
