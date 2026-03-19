const CountryManagerService = require('../Service/CountryManagerService.js');

const login = async (req, res) => {
    try {
        const { email, password } = req.body;
        const tokens = await CountryManagerService.login(email, password);
        return res.status(200).json({ success: true, ...tokens });
    } catch (error) {
        const statusCode = error.statusCode || 401;
        return res.status(statusCode).json({ success: false, message: error.message });
    }
};

const refreshToken = async (req, res) => {
    try {
        const { refreshToken } = req.body;
        const newToken = await CountryManagerService.refreshAccessToken(refreshToken);
        return res.json(newToken);
    } catch (error) {
        return res.status(403).json({ message: 'Invalid refresh token' });
    }
};

const addCountryManager = async (req, res) => {
    try {
        const data = { ...req.body };
        data.createdBy = req.user.id;
        data.creatorRole = req.user.role;
        const newManager = await CountryManagerService.create(data);
        return res.status(201).json({ success: true, data: newManager });
    } catch (error) {
        const statusCode = error.statusCode || 500;
        return res.status(statusCode).json({ success: false, message: error.message });
    }
};

const getCountryManagers = async (req, res) => {
    try {
        const result = await CountryManagerService.getAll(req.query);
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

const getCountryManagerById = async (req, res) => {
    try {
        const manager = await CountryManagerService.getById(req.params.id);
        if (!manager) return res.status(404).json({ success: false, message: 'Country Manager not found' });
        return res.status(200).json({ success: true, data: manager });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

const editCountryManager = async (req, res) => {
    try {
        const updatedManager = await CountryManagerService.update(req.params.id, req.body);
        return res.status(200).json({ success: true, data: updatedManager });
    } catch (error) {
        const statusCode = error.statusCode || 500;
        return res.status(statusCode).json({ success: false, message: error.message });
    }
};

const changePassword = async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        const result = await CountryManagerService.changePassword(req.params.id, currentPassword, newPassword);
        return res.status(200).json({ success: true, ...result });
    } catch (error) {
        const statusCode = error.statusCode || 500;
        return res.status(statusCode).json({ success: false, message: error.message });
    }
};

const deleteCountryManager = async (req, res) => {
    try {
        await CountryManagerService.remove(req.params.id);
        return res.status(200).json({ success: true, message: 'Country Manager deleted successfully' });
    } catch (error) {
        const statusCode = error.statusCode || 500;
        return res.status(statusCode).json({ success: false, message: error.message });
    }
};

module.exports = {
    login,
    refreshToken,
    addCountryManager,
    getCountryManagers,
    getCountryManagerById,
    editCountryManager,
    changePassword,
    deleteCountryManager
};
