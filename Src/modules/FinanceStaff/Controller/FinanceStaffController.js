const FinanceStaffService = require('../Service/FinanceStaffService.js');
const BranchService = require('../../Branch/Service/BranchService.js');

const login = async (req, res) => {
    try {
        const { email, password } = req.body;
        const tokens = await FinanceStaffService.login(email, password);
        return res.status(200).json({ success: true, ...tokens });
    } catch (error) {
        const statusCode = error.statusCode || 401;
        return res.status(statusCode).json({ success: false, message: error.message });
    }
};

const logout = async (req, res) => {
    try {
        await FinanceStaffService.logout(req.user.id);
        return res.status(200).json({ success: true, message: 'Logged out successfully' });
    } catch (error) {
        const statusCode = error.statusCode || 500;
        return res.status(statusCode).json({ success: false, message: error.message });
    }
};

const addFinanceStaff = async (req, res) => {
    try {
        const data = { ...req.body };
        data.createdBy = req.user.id;
        data.creatorRole = req.user.role;
        const newStaff = await FinanceStaffService.create(data);
        return res.status(201).json({ success: true, data: newStaff });
    } catch (error) {
        const statusCode = error.statusCode || 500;
        return res.status(statusCode).json({ success: false, message: error.message });
    }
};

const getFinanceStaff = async (req, res) => {
    try {
        const queryParams = { ...req.query };
        const options = {};
        
        // If user is COUNTRYMANAGER, restrict staff to branches in their country
        if (req.user.role === 'COUNTRYMANAGER' && req.user.country) {
            const countryBranches = await BranchService.getAll({ country: req.user.country });
            const branchIds = (countryBranches.data || []).map(b => b._id);
            options.baseQuery = { branchId: { $in: branchIds } };
        }

        const result = await FinanceStaffService.getAll(queryParams, options);
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

const getFinanceStaffById = async (req, res) => {
    try {
        const staff = await FinanceStaffService.getById(req.params.id);
        if (!staff) return res.status(404).json({ success: false, message: 'Finance Staff not found' });
        return res.status(200).json({ success: true, data: staff });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

const editFinanceStaff = async (req, res) => {
    try {
        const updatedStaff = await FinanceStaffService.update(req.params.id, req.body);
        return res.status(200).json({ success: true, data: updatedStaff });
    } catch (error) {
        const statusCode = error.statusCode || 500;
        return res.status(statusCode).json({ success: false, message: error.message });
    }
};

const changePassword = async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        const result = await FinanceStaffService.changePassword(req.params.id, currentPassword, newPassword);
        return res.status(200).json({ success: true, ...result });
    } catch (error) {
        const statusCode = error.statusCode || 500;
        return res.status(statusCode).json({ success: false, message: error.message });
    }
};

const deleteFinanceStaff = async (req, res) => {
    try {
        await FinanceStaffService.remove(req.params.id);
        return res.status(200).json({ success: true, message: 'Finance Staff deleted successfully' });
    } catch (error) {
        const statusCode = error.statusCode || 500;
        return res.status(statusCode).json({ success: false, message: error.message });
    }
};

const refreshToken = async (req, res) => {
    try {
        const { refreshToken } = req.body;
        const result = await FinanceStaffService.refreshAccessToken(refreshToken);
        return res.status(200).json({ success: true, ...result });
    } catch (error) {
        const statusCode = error.statusCode || 401;
        return res.status(statusCode).json({ success: false, message: error.message });
    }
};

module.exports = {
    login,
    logout,
    refreshToken,
    addFinanceStaff,
    getFinanceStaff,
    getFinanceStaffById,
    editFinanceStaff,
    changePassword,
    deleteFinanceStaff
};

