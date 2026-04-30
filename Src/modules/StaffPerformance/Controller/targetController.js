const targetService = require("../Service/targetService");

exports.assignTarget = async (req, res) => {
    try {
        const target = await targetService.assignTarget(req.body, req.user);
        return res.status(201).json({
            success: true,
            message: "Target assigned successfully",
            data: target,
        });
    } catch (error) {
        console.error("Assign target error:", error);
        return res.status(500).json({
            success: false,
            message: error.message || "Failed to assign target",
        });
    }
};

exports.getTargets = async (req, res) => {
    try {
        const targets = await targetService.getTargets(req.query, req.user);
        return res.status(200).json({
            success: true,
            data: targets,
        });
    } catch (error) {
        console.error("Get targets error:", error);
        return res.status(500).json({
            success: false,
            message: error.message || "Failed to fetch targets",
        });
    }
};
