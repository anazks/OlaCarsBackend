const MerchendiseService = require('../Service/MerchendiseService.js');

exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;
        const result = await MerchendiseService.loginService(email, password);
        return res.status(200).json({ success: true, ...result });
    } catch (error) {
        const statusCode = error.statusCode || 401;
        return res.status(statusCode).json({ success: false, message: error.message });
    }
};

exports.addMerchendise = async (req, res) => {
    try {
        const data = { ...req.body };
        if (req.user) {
            data.createdBy = req.user.id;
            data.creatorRole = req.user.role;
        }
        const newUser = await MerchendiseService.create(data);
        return res.status(201).json({ success: true, data: newUser });
    } catch (error) {
        const statusCode = error.statusCode || 500;
        return res.status(statusCode).json({ success: false, message: error.message });
    }
};

exports.getMerchendise = async (req, res) => {
    try {
        const queryParams = { ...req.query };
        const result = await MerchendiseService.getAll(queryParams, { baseQuery: { isDeleted: false } });
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

exports.getMerchendiseById = async (req, res) => {
    try {
        const result = await MerchendiseService.getById(req.params.id);
        return res.status(200).json({ success: true, data: result });
    } catch (error) {
        const statusCode = error.statusCode || 500;
        return res.status(statusCode).json({ success: false, message: error.message });
    }
};

exports.editMerchendise = async (req, res) => {
    try {
        const result = await MerchendiseService.update(req.params.id, req.body);
        return res.status(200).json({ success: true, data: result });
    } catch (error) {
        const statusCode = error.statusCode || 500;
        return res.status(statusCode).json({ success: false, message: error.message });
    }
};

exports.deleteMerchendise = async (req, res) => {
    try {
        await MerchendiseService.remove(req.params.id);
        return res.status(200).json({ success: true, message: "Merchendise user deleted successfully" });
    } catch (error) {
        const statusCode = error.statusCode || 500;
        return res.status(statusCode).json({ success: false, message: error.message });
    }
};
