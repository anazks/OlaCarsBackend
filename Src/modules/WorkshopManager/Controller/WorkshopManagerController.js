const WorkshopManagerService = require('../Service/WorkshopManagerService.js');

const login = async (req, res) => {
    try {
        const { email, password } = req.body;
        const tokens = await WorkshopManagerService.login(email, password);
        return res.status(200).json({ success: true, ...tokens });
    } catch (error) {
        const statusCode = error.statusCode || 401;
        return res.status(statusCode).json({ success: false, message: error.message });
    }
};

const addWorkshopManager = async (req, res) => {
    try {
        const data = { ...req.body };
        data.createdBy = req.user.id;
        data.creatorRole = req.user.role;
        const newManager = await WorkshopManagerService.create(data);
        return res.status(201).json({ success: true, data: newManager });
    } catch (error) {
        const statusCode = error.statusCode || 500;
        return res.status(statusCode).json({ success: false, message: error.message });
    }
};

const getWorkshopManager = async (req, res) => {
    try {
        const queryParams = { ...req.query };
        const options = {};

        // If user is COUNTRYMANAGER, restrict to branches in their country
        const BranchService = require('../../Branch/Service/BranchService.js');
        if (req.user.role === 'COUNTRYMANAGER' && req.user.country) {
            const countryBranches = await BranchService.getAll({ country: req.user.country });
            const branchIds = (countryBranches.data || []).map(b => b._id);
            options.baseQuery = { branchId: { $in: branchIds } };
        }

        const result = await WorkshopManagerService.getAll(queryParams, options);
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

const getWorkshopManagerById = async (req, res) => {
    try {
        const manager = await WorkshopManagerService.getById(req.params.id);
        if (!manager) return res.status(404).json({ success: false, message: 'Workshop Manager not found' });
        return res.status(200).json({ success: true, data: manager });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

const editWorkshopManager = async (req, res) => {
    try {
        const updatedManager = await WorkshopManagerService.update(req.params.id, req.body);
        return res.status(200).json({ success: true, data: updatedManager });
    } catch (error) {
        const statusCode = error.statusCode || 500;
        return res.status(statusCode).json({ success: false, message: error.message });
    }
};

const changePassword = async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        const result = await WorkshopManagerService.changePassword(req.params.id, currentPassword, newPassword);
        return res.status(200).json({ success: true, ...result });
    } catch (error) {
        const statusCode = error.statusCode || 500;
        return res.status(statusCode).json({ success: false, message: error.message });
    }
};

const deleteWorkshopManager = async (req, res) => {
    try {
        await WorkshopManagerService.remove(req.params.id);
        return res.status(200).json({ success: true, message: 'Workshop Manager deleted successfully' });
    } catch (error) {
        const statusCode = error.statusCode || 500;
        return res.status(statusCode).json({ success: false, message: error.message });
    }
};

const refreshManagerToken = async (req, res) => {
    try {
        const { token } = req.body;
        if (!token) {
            const AppError = require('../../../shared/utils/AppError.js');
            throw new AppError('Refresh token is required', 400);
        }

        const tokens = await WorkshopManagerService.refreshSession(token);
        return res.status(200).json({ success: true, ...tokens });
    } catch (error) {
        const statusCode = error.statusCode || 401;
        return res.status(statusCode).json({ success: false, message: error.message });
    }
};

module.exports = {
    login,
    addWorkshopManager,
    getWorkshopManager,
    getWorkshopManagerById,
    editWorkshopManager,
    changePassword,
    deleteWorkshopManager,
    refreshManagerToken
};
