const WorkshopManagerService = require('../Service/WorkshopManagerService.js');

exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;
        const result = await WorkshopManagerService.loginService(email, password);
        return res.status(200).json({ success: true, ...result });
    } catch (error) {
        const statusCode = error.statusCode || 401;
        return res.status(statusCode).json({ success: false, message: error.message });
    }
};

exports.addWorkshopManager = async (req, res) => {
    try {
        const data = { ...req.body };
        data.createdBy = req.user.id;
        data.creatorRole = req.user.role;
        const newManager = await WorkshopManagerService.createWorkshopManagerService(data);
        return res.status(201).json({ success: true, data: newManager });
    } catch (error) {
        const statusCode = error.statusCode || 500;
        return res.status(statusCode).json({ success: false, message: error.message });
    }
};

exports.getWorkshopManager = async (req, res) => {
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

        const result = await WorkshopManagerService.getAllWorkshopManagersService(queryParams, options);
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

exports.getWorkshopManagerById = async (req, res) => {
    try {
        const result = await WorkshopManagerService.getWorkshopManagerByIdService(req.params.id);
        return res.status(200).json({ success: true, data: result });
    } catch (error) {
        const statusCode = error.statusCode || 500;
        return res.status(statusCode).json({ success: false, message: error.message });
    }
};

exports.editWorkshopManager = async (req, res) => {
    try {
        const payload = { ...req.body, modifierId: req.user.id, modifierRole: req.user.role };
        const result = await WorkshopManagerService.updateWorkshopManagerService(req.params.id, payload);
        return res.status(200).json({ success: true, data: result });
    } catch (error) {
        const statusCode = error.statusCode || 500;
        return res.status(statusCode).json({ success: false, message: error.message });
    }
};

exports.deleteWorkshopManager = async (req, res) => {
    try {
        await WorkshopManagerService.deleteWorkshopManagerService(req.params.id);
        return res.status(200).json({ success: true, message: "Workshop Manager deleted successfully" });
    } catch (error) {
        const statusCode = error.statusCode || 500;
        return res.status(statusCode).json({ success: false, message: error.message });
    }
};

exports.changePassword = async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        const result = await WorkshopManagerService.changePasswordService(req.params.id, currentPassword, newPassword);
        return res.status(200).json({ success: true, ...result });
    } catch (error) {
        const statusCode = error.statusCode || 500;
        return res.status(statusCode).json({ success: false, message: error.message });
    }
};

exports.refreshManagerToken = async (req, res) => {
    try {
        const { token } = req.body;
        const result = await WorkshopManagerService.refreshSessionService(token);
        return res.status(200).json({ success: true, ...result });
    } catch (error) {
        const statusCode = error.statusCode || 401;
        return res.status(statusCode).json({ success: false, message: error.message });
    }
};

