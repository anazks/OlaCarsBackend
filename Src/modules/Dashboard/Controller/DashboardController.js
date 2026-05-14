const DashboardService = require("../Service/DashboardService");
const { ROLES } = require("../../../shared/constants/roles");

const attachRoleFilters = (user, query) => {
    const filters = { ...query };
    // Restrict view based on role
    if (user.role === ROLES.COUNTRYMANAGER) {
        filters.country = user.country;
    } else if (user.role === ROLES.BRANCHMANAGER || user.role === ROLES.FINANCESTAFF || user.role === ROLES.OPERATIONSTAFF) {
        filters.branch = user.branchId;
    }
    return filters;
};

exports.getFinancialDashboardSummary = async (req, res) => {
    try {
        const filters = attachRoleFilters(req.user, req.query);
        
        const [summary, revenueTrend, overduePayments, movement] = await Promise.all([
            DashboardService.getSummaryStats(filters),
            DashboardService.getRevenueOverview(filters),
            DashboardService.getRecentOverduePayments(filters),
            DashboardService.getVehicleMovement(filters)
        ]);

        res.status(200).json({
            status: "success",
            data: {
                ...summary,
                revenueOverview: revenueTrend,
                overduePayments,
                vehicleMovement: movement
            }
        });
    } catch (error) {
        console.error("Error getting financial summary:", error);
        res.status(500).json({
            status: "error",
            message: "Internal Server Error",
            error: error.message
        });
    }
};

exports.getVehicleMovementData = async (req, res) => {
    try {
        const filters = attachRoleFilters(req.user, req.query);
        const data = await DashboardService.getVehicleMovement(filters);
        res.status(200).json({ status: "success", data });
    } catch (error) {
        res.status(500).json({ status: "error", message: error.message });
    }
};
