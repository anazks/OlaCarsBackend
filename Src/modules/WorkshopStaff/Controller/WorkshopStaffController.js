const WorkshopStaffService = require('../Service/WorkshopStaffService.js');

const login = async (req, res) => {
    try {
        const { email, password } = req.body;
        const result = await WorkshopStaffService.login(email, password);
        return res.status(200).json({ 
            success: true, 
            ...result,
            data: result.staff // For alternative frontend checks
        });
    } catch (error) {
        const statusCode = error.statusCode || 401;
        return res.status(statusCode).json({ success: false, message: error.message });
    }
};

const addWorkshopStaff = async (req, res) => {
    try {
        const data = { ...req.body };
        data.createdBy = req.user.id;
        data.creatorRole = req.user.role;
        const newStaff = await WorkshopStaffService.create(data);
        return res.status(201).json({ success: true, data: newStaff });
    } catch (error) {
        const statusCode = error.statusCode || 500;
        return res.status(statusCode).json({ success: false, message: error.message });
    }
};

const getWorkshopStaff = async (req, res) => {
    try {
        const queryParams = { ...req.query };
        const options = {};

        // If user is COUNTRYMANAGER, restrict staff to branches in their country
        const BranchService = require('../../Branch/Service/BranchService.js');
        if (req.user.role === 'COUNTRYMANAGER' && req.user.country) {
            const countryBranches = await BranchService.getAll({ country: req.user.country });
            const branchIds = (countryBranches.data || []).map(b => b._id);
            options.baseQuery = { branchId: { $in: branchIds } };
        }

        const result = await WorkshopStaffService.getAll(queryParams, options);
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

const getWorkshopStaffById = async (req, res) => {
    try {
        const staff = await WorkshopStaffService.getById(req.params.id);
        if (!staff) return res.status(404).json({ success: false, message: 'Workshop Staff not found' });
        return res.status(200).json({ success: true, data: staff });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

const editWorkshopStaff = async (req, res) => {
    try {
        const payload = { ...req.body, modifierId: req.user.id, modifierRole: req.user.role };
        const updatedStaff = await WorkshopStaffService.update(req.params.id, payload);
        return res.status(200).json({ success: true, data: updatedStaff });
    } catch (error) {
        const statusCode = error.statusCode || 500;
        return res.status(statusCode).json({ success: false, message: error.message });
    }
};

const changePassword = async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        const result = await WorkshopStaffService.changePassword(req.params.id, currentPassword, newPassword);
        return res.status(200).json({ success: true, ...result });
    } catch (error) {
        const statusCode = error.statusCode || 500;
        return res.status(statusCode).json({ success: false, message: error.message });
    }
};

const deleteWorkshopStaff = async (req, res) => {
    try {
        await WorkshopStaffService.remove(req.params.id);
        return res.status(200).json({ success: true, message: 'Workshop Staff deleted successfully' });
    } catch (error) {
        const statusCode = error.statusCode || 500;
        return res.status(statusCode).json({ success: false, message: error.message });
    }
};

const refreshStaffToken = async (req, res) => {
    try {
        const { token } = req.body;
        if (!token) throw new AppError('Refresh token is required', 400);

        const tokens = await WorkshopStaffService.refreshSession(token);
        return res.status(200).json({ success: true, ...tokens });
    } catch (error) {
        const statusCode = error.statusCode || 401;
        return res.status(statusCode).json({ success: false, message: error.message });
    }
};

module.exports = {
    login,
    addWorkshopStaff,
    getWorkshopStaff,
    getWorkshopStaffById,
    editWorkshopStaff,
    changePassword,
    deleteWorkshopStaff,
    refreshStaffToken
};
