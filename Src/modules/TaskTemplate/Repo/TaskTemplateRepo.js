const { TaskTemplate } = require("../Model/TaskTemplateModel");

/**
 * Create a new task template.
 */
const createTaskTemplate = async (data) => {
    return await TaskTemplate.create(data);
};

/**
 * Get all task templates with optional filters.
 */
const getTaskTemplates = async (filters = {}) => {
    const query = { isActive: true };

    if (filters.branchId) query.branchId = filters.branchId;
    if (filters.workOrderType) query.workOrderTypes = filters.workOrderType;
    if (filters.isActive === false) query.isActive = false;
    if (filters.search) {
        query.name = { $regex: filters.search, $options: "i" };
    }

    return await TaskTemplate.find(query)
        .populate("linkedParts.inventoryPartId", "partName partNumber quantityOnHand quantityReserved unitCost isActive")
        .sort({ name: 1 });
};

/**
 * Get a single task template by ID.
 */
const getTaskTemplateById = async (id) => {
    return await TaskTemplate.findById(id)
        .populate("linkedParts.inventoryPartId", "partName partNumber quantityOnHand quantityReserved unitCost isActive");
};

/**
 * Get task templates by work order type for a specific branch.
 */
const getTaskTemplatesByType = async (workOrderType, branchId) => {
    const query = { isActive: true, workOrderTypes: workOrderType };
    if (branchId) query.branchId = branchId;

    return await TaskTemplate.find(query)
        .populate("linkedParts.inventoryPartId", "partName partNumber quantityOnHand quantityReserved unitCost isActive")
        .sort({ name: 1 });
};

/**
 * Update a task template.
 */
const updateTaskTemplate = async (id, data) => {
    return await TaskTemplate.findByIdAndUpdate(id, data, { new: true })
        .populate("linkedParts.inventoryPartId", "partName partNumber quantityOnHand quantityReserved unitCost isActive");
};

/**
 * Soft-delete a task template.
 */
const deleteTaskTemplate = async (id) => {
    return await TaskTemplate.findByIdAndUpdate(id, { isActive: false }, { new: true });
};

module.exports = {
    createTaskTemplate,
    getTaskTemplates,
    getTaskTemplateById,
    getTaskTemplatesByType,
    updateTaskTemplate,
    deleteTaskTemplate,
};
