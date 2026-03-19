const BranchManagerService = require('../Service/BranchManagerService.js');

const login = async (req, res) => {
    try {
        const { email, password } = req.body;
        const tokens = await BranchManagerService.login(email, password);
        return res.status(200).json({ success: true, ...tokens });
    } catch (error) {
        const statusCode = error.statusCode || 401;
        return res.status(statusCode).json({ success: false, message: error.message });
    }
};

const addBranchManager = async (req, res) => {
    try {
        const data = { ...req.body };
        data.createdBy = req.user.id;
        data.creatorRole = req.user.role;
        const newManager = await BranchManagerService.create(data);
        return res.status(201).json({ success: true, data: newManager });
    } catch (error) {
        const statusCode = error.statusCode || 500;
        return res.status(statusCode).json({ success: false, message: error.message });
    }
};

const getBranchManagers = async (req, res) => {
    try {
        const result = await BranchManagerService.getAll(req.query);
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

const getBranchManagerById = async (req, res) => {
    try {
        const manager = await BranchManagerService.getById(req.params.id);
        if (!manager) return res.status(404).json({ success: false, message: 'Branch Manager not found' });
        return res.status(200).json({ success: true, data: manager });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

const editBranchManager = async (req, res) => {
    try {
        const updatedManager = await BranchManagerService.update(req.params.id, req.body);
        return res.status(200).json({ success: true, data: updatedManager });
    } catch (error) {
        const statusCode = error.statusCode || 500;
        return res.status(statusCode).json({ success: false, message: error.message });
    }
};

const changePassword = async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        const result = await BranchManagerService.changePassword(req.params.id, currentPassword, newPassword);
        return res.status(200).json({ success: true, ...result });
    } catch (error) {
        const statusCode = error.statusCode || 500;
        return res.status(statusCode).json({ success: false, message: error.message });
    }
};

const deleteBranchManager = async (req, res) => {
    try {
        await BranchManagerService.remove(req.params.id);
        return res.status(200).json({ success: true, message: 'Branch Manager deleted successfully' });
    } catch (error) {
        const statusCode = error.statusCode || 500;
        return res.status(statusCode).json({ success: false, message: error.message });
    }
};

module.exports = {
    login,
    addBranchManager,
    getBranchManagers,
    getBranchManagerById,
    editBranchManager,
    changePassword,
    deleteBranchManager
};
