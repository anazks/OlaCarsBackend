const WorkshopManagerService = require("../Service/WorkshopManagerService");

exports.addWorkshopManager = async (req, res) => {
    try {
        const result = await WorkshopManagerService.addWorkshopManagerService({
            ...req.body,
            createdBy: req.user.id,
            creatorRole: req.user.role
        });
        return res.status(201).json({ success: true, data: result, message: "Workshop Manager created successfully" });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

exports.editWorkshopManager = async (req, res) => {
    try {
        const result = await WorkshopManagerService.editWorkshopManagerService({
            id: req.params.id,
            ...req.body
        });
        return res.status(200).json({ success: true, data: result, message: "Workshop Manager updated successfully" });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

exports.deleteWorkshopManager = async (req, res) => {
    try {
        await WorkshopManagerService.deleteWorkshopManagerService(req.params.id);
        return res.status(200).json({ success: true, message: "Workshop Manager deleted successfully" });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

exports.getWorkshopManagers = async (req, res) => {
    try {
        const result = await WorkshopManagerService.getWorkshopManagersService(req.query);
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
        if (!result) return res.status(404).json({ success: false, message: "Workshop Manager not found" });
        return res.status(200).json({ success: true, data: result });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;
        const { manager, accessToken, refreshToken } = await WorkshopManagerService.loginWorkshopManagerService(email, password);
        return res.status(200).json({ success: true, manager, token: accessToken, refreshToken });
    } catch (error) {
        return res.status(401).json({ success: false, message: error.message });
    }
};
