const ReportingService = require("../Service/ReportingService");
const { ROLES } = require("../../../shared/constants/roles");

exports.getPL = async (req, res) => {
    try {
        const filters = { ...req.query };
        const user = req.user;

        // Apply role-based restrictions
        if (user.role === ROLES.COUNTRYMANAGER) {
            filters.country = user.country;
        } else if (user.role === ROLES.BRANCHMANAGER || user.role === ROLES.FINANCESTAFF || user.role === ROLES.OPERATIONSTAFF) {
            filters.branch = user.branchId;
        }

        const report = await ReportingService.getPLReport(filters);
        res.status(200).json({
            status: "success",
            data: report
        });
    } catch (error) {
        res.status(500).json({
            status: "error",
            message: error.message
        });
    }
};

exports.getBalanceSheet = async (req, res) => {
    try {
        const filters = { ...req.query };
        const user = req.user;

        // Apply role-based restrictions
        if (user.role === ROLES.COUNTRYMANAGER) {
            filters.country = user.country;
        } else if (user.role === ROLES.BRANCHMANAGER || user.role === ROLES.FINANCESTAFF) {
            filters.branch = user.branchId;
        }

        const report = await ReportingService.getBalanceSheetReport(filters);
        res.status(200).json({
            status: "success",
            data: report
        });
    } catch (error) {
        res.status(500).json({
            status: "error",
            message: error.message
        });
    }
};

