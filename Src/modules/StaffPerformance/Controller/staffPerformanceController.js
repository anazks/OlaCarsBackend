const staffPerformanceService = require("../Service/staffPerformanceService");

exports.getPerformance = async (req, res) => {
    try {
        const filters = {};

        // Branch filter from query param
        if (req.query.branch) {
            filters.branchId = req.query.branch;
        }

        // Date filters
        if (req.query.startDate) filters.startDate = req.query.startDate;
        if (req.query.endDate) filters.endDate = req.query.endDate;

        // If branch manager, restrict to their own branch
        if (req.user.role === "BRANCHMANAGER" && req.user.branchId) {
            filters.branchId = req.user.branchId;
        }

        // If country manager, restrict to their own country
        if (req.user.role === "COUNTRYMANAGER" && req.user.country) {
            filters.country = req.user.country;
        }

        // Staff type filter
        if (req.query.type) {
            filters.type = req.query.type;
        }

        // Cache bypass flags
        if (req.query.refresh || req.headers['x-bypass-cache'] === 'true') {
            filters.refresh = 'true';
        }
        if (req.query.bypassCache) {
            filters.bypassCache = req.query.bypassCache;
        }

        const result = await staffPerformanceService.getStaffPerformance(filters);

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

exports.getIndividualPerformance = async (req, res) => {
    try {
        const { id } = req.params;
        const { startDate, endDate, refresh } = req.query;
        const isBypass = refresh === 'true' || req.headers['x-bypass-cache'] === 'true';

        if (!id) {
            return res.status(400).json({
                success: false,
                message: "Staff ID is required",
            });
        }

        const result = await staffPerformanceService.getIndividualStaffPerformance(id, startDate, endDate, isBypass);

        return res.status(200).json({
            success: true,
            data: result,
        });
    } catch (error) {
        console.error("Individual staff performance error:", error);
        return res.status(500).json({
            success: false,
            message: error.message || "Failed to fetch individual staff performance data",
        });
    }
};

exports.clearPerformanceCache = async (req, res) => {
    try {
        staffPerformanceService.clearStaffPerformanceCache();
        return res.status(200).json({
            success: true,
            message: "Staff performance cache cleared successfully."
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message || "Failed to clear staff performance cache"
        });
    }
};
