const { getStaffPerformance } = require("../Service/staffPerformanceService");

exports.getPerformance = async (req, res) => {
    try {
        const filters = {};

        // Branch filter from query param
        if (req.query.branch) {
            filters.branchId = req.query.branch;
        }

        // If branch manager, restrict to their own branch
        if (req.user.role === "BRANCHMANAGER" && req.user.branchId) {
            filters.branchId = req.user.branchId;
        }

        // Staff type filter
        if (req.query.type && ["finance", "operation"].includes(req.query.type)) {
            filters.type = req.query.type;
        }

        const result = await getStaffPerformance(filters);

        return res.status(200).json({
            success: true,
            data: result,
        });
    } catch (error) {
        console.error("Staff performance error:", error);
        return res.status(500).json({
            success: false,
            message: error.message || "Failed to fetch staff performance data",
        });
    }
};
