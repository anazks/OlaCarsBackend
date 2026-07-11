const TaskTemplateRepo = require("../Repo/TaskTemplateRepo");

// ─── Create ──────────────────────────────────────────────────────────

const createTaskTemplateHandler = async (req, res) => {
    try {
        const data = req.body;
        data.createdBy = req.user.id;
        data.creatorRole = req.user.role;

        if (!data.branchId) data.branchId = req.user.branchId;

        if (!data.name || !data.category) {
            return res.status(400).json({ success: false, message: "Name and category are required." });
        }
        if (!data.workOrderTypes || data.workOrderTypes.length === 0) {
            return res.status(400).json({ success: false, message: "At least one work order type must be selected." });
        }

        const template = await TaskTemplateRepo.createTaskTemplate(data);
        return res.status(201).json({ success: true, data: template });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

// ─── List ────────────────────────────────────────────────────────────

const getTaskTemplatesHandler = async (req, res) => {
    try {
        const filters = {};
        if (req.query.branchId) filters.branchId = req.query.branchId;
        if (req.query.workOrderType) filters.workOrderType = req.query.workOrderType;
        if (req.query.search) filters.search = req.query.search;
        if (req.query.isActive === "false") filters.isActive = false;

        // Default to user's branch if not provided
        if (!filters.branchId && req.user.branchId) {
            filters.branchId = req.user.branchId;
        }

        const templates = await TaskTemplateRepo.getTaskTemplates(filters);
        return res.status(200).json({ success: true, data: templates });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

// ─── Get by ID ───────────────────────────────────────────────────────

const getTaskTemplateByIdHandler = async (req, res) => {
    try {
        const template = await TaskTemplateRepo.getTaskTemplateById(req.params.id);
        if (!template) {
            return res.status(404).json({ success: false, message: "Task template not found." });
        }
        return res.status(200).json({ success: true, data: template });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

// ─── Get by Work Order Type ──────────────────────────────────────────

const getTaskTemplatesByTypeHandler = async (req, res) => {
    try {
        const { type } = req.params;
        const branchId = req.query.branchId || req.user.branchId;
        const templates = await TaskTemplateRepo.getTaskTemplatesByType(type, branchId);
        return res.status(200).json({ success: true, data: templates });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

// ─── Update ──────────────────────────────────────────────────────────

const updateTaskTemplateHandler = async (req, res) => {
    try {
        const template = await TaskTemplateRepo.updateTaskTemplate(req.params.id, req.body);
        if (!template) {
            return res.status(404).json({ success: false, message: "Task template not found." });
        }
        return res.status(200).json({ success: true, data: template });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

// ─── Delete ──────────────────────────────────────────────────────────

const deleteTaskTemplateHandler = async (req, res) => {
    try {
        const template = await TaskTemplateRepo.deleteTaskTemplate(req.params.id);
        if (!template) {
            return res.status(404).json({ success: false, message: "Task template not found." });
        }
        return res.status(200).json({ success: true, data: template });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = {
    createTaskTemplateHandler,
    getTaskTemplatesHandler,
    getTaskTemplateByIdHandler,
    getTaskTemplatesByTypeHandler,
    updateTaskTemplateHandler,
    deleteTaskTemplateHandler,
};
