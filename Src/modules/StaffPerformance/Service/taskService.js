const Task = require("../Model/TaskModel");

/**
 * Delegate a task
 */
exports.delegateTask = async (taskData, user) => {
    const { title, description, assignedTo, assignedToRole, assignedToRoleModel, dueDate, notes } = taskData;

    let assignedByRoleModel = "";
    const role = user.role.toUpperCase().replace(" ", "");
    
    switch (role) {
        case "ADMIN":
        case "SUPERADMIN":
            assignedByRoleModel = "Admin";
            break;
        case "COUNTRYMANAGER":
            assignedByRoleModel = "CountryManager";
            break;
        case "BRANCHMANAGER":
            assignedByRoleModel = "BranchManager";
            break;
        case "FINANCEADMIN":
            assignedByRoleModel = "FinanceAdmin";
            break;
        case "OPERATIONADMIN":
            assignedByRoleModel = "OperationAdmin";
            break;
        default:
            throw new Error("Unauthorized to delegate tasks");
    }

    const task = new Task({
        title,
        description,
        assignedTo,
        assignedToRole,
        assignedToRoleModel,
        assignedBy: user.id,
        assignedByRole: user.role,
        assignedByRoleModel,
        dueDate: new Date(dueDate),
        notes
    });

    await task.save();
    return task;
};

/**
 * Update task status
 */
exports.updateTaskStatus = async (taskId, status, user) => {
    const task = await Task.findById(taskId);
    if (!task) throw new Error("Task not found");

    // Only assignedTo or assignedBy can update status?
    // Let's keep it simple for now
    task.status = status;
    if (status === "COMPLETED") {
        task.completedAt = new Date();
    }
    
    await task.save();
    return task;
};

/**
 * Get tasks assigned to a user or by a user
 */
exports.getTasks = async (filters, user) => {
    const query = {};
    const userId = user.id;

    // Default: Show tasks assigned TO the user OR assigned BY the user
    query.$or = [
        { assignedTo: userId },
        { assignedBy: userId }
    ];

    // If explicit filters provided in query (e.g. by frontend), apply them
    if (filters.assignedTo) query.assignedTo = filters.assignedTo;
    if (filters.assignedBy) query.assignedBy = filters.assignedBy;
    if (filters.status) query.status = filters.status;
    
    return await Task.find(query).populate("assignedBy", "fullName").sort({ dueDate: 1 });
};
