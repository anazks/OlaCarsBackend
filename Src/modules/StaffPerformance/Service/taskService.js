const Task = require("../Model/TaskModel");

/**
 * Delegate a task
 */
exports.delegateTask = async (taskData, user) => {
    const { title, description, targetType, targetId, dueDate, notes } = taskData;

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
        targetType,
        targetId,
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
    const role = user.role.toUpperCase().replace(" ", "");

    console.log(`[TaskService] getTasks for role=${role}, userId=${userId}, branchId=${user.branchId}`);

    // Role-based jurisdiction filtering (similar to targetService)
    if (!["ADMIN", "SUPERADMIN", "FINANCEADMIN", "OPERATIONADMIN"].includes(role)) {
        if (role === "COUNTRYMANAGER") {
            query.$or = [
                { targetType: "COUNTRY", targetId: user.country },
                { assignedBy: userId }
            ];
        } else if (role === "BRANCHMANAGER") {
            query.$or = [
                { targetType: "BRANCH", targetId: user.branchId },
                { targetType: "STAFF", targetId: userId },
                { assignedBy: userId }
            ];
        } else {
            // OPERATIONSTAFF, FINANCESTAFF, etc.
            const orConditions = [
                { targetType: "STAFF", targetId: userId },
                { assignedBy: userId }
            ];
            // Also show BRANCH-level tasks for their branch
            if (user.branchId) {
                orConditions.push({ targetType: "BRANCH", targetId: user.branchId.toString() });
            }
            query.$or = orConditions;
        }
    } else {
        // Admins see everything or can filter
        if (filters.targetId) query.targetId = filters.targetId;
        if (filters.assignedBy) query.assignedBy = filters.assignedBy;
    }

    if (filters.status) query.status = filters.status;
    
    console.log(`[TaskService] Query:`, JSON.stringify(query));
    const results = await Task.find(query).populate("assignedBy", "fullName").sort({ dueDate: 1 });
    console.log(`[TaskService] Found ${results.length} tasks`);
    return results;
};
