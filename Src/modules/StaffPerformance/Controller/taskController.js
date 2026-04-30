const taskService = require("../Service/taskService");

exports.delegateTask = async (req, res) => {
    try {
        const task = await taskService.delegateTask(req.body, req.user);
        return res.status(201).json({
            success: true,
            message: "Task delegated successfully",
            data: task,
        });
    } catch (error) {
        console.error("Delegate task error:", error);
        return res.status(500).json({
            success: false,
            message: error.message || "Failed to delegate task",
        });
    }
};

exports.updateTaskStatus = async (req, res) => {
    try {
        const { taskId } = req.params;
        const { status } = req.body;
        const task = await taskService.updateTaskStatus(taskId, status, req.user);
        return res.status(200).json({
            success: true,
            message: "Task status updated successfully",
            data: task,
        });
    } catch (error) {
        console.error("Update task status error:", error);
        return res.status(500).json({
            success: false,
            message: error.message || "Failed to update task status",
        });
    }
};

exports.getTasks = async (req, res) => {
    try {
        const tasks = await taskService.getTasks(req.query, req.user);
        return res.status(200).json({
            success: true,
            data: tasks,
        });
    } catch (error) {
        console.error("Get tasks error:", error);
        return res.status(500).json({
            success: false,
            message: error.message || "Failed to fetch tasks",
        });
    }
};
