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

exports.getDailyFinance = async (req, res) => {
    try {
        const filters = { ...req.query };
        const user = req.user;

        if (user.role === ROLES.COUNTRYMANAGER) {
            filters.country = user.country;
        } else if (user.role === ROLES.BRANCHMANAGER || user.role === ROLES.FINANCESTAFF) {
            filters.branch = user.branchId;
        }

        const report = await ReportingService.getDailyFinanceReport(filters);
        res.status(200).json({ status: "success", data: report });
    } catch (error) {
        res.status(500).json({ status: "error", message: error.message });
    }
};

exports.getDriverPerformance = async (req, res) => {
    try {
        const filters = { ...req.query };
        const user = req.user;

        if (user.role === ROLES.COUNTRYMANAGER) {
            filters.country = user.country;
        } else if (user.role === ROLES.BRANCHMANAGER || user.role === ROLES.OPERATIONSTAFF) {
            filters.branch = user.branchId;
        }

        const report = await ReportingService.getDriverPerformanceReport(filters);
        res.status(200).json({ status: "success", data: report });
    } catch (error) {
        res.status(500).json({ status: "error", message: error.message });
    }
};

exports.getStaffPerformance = async (req, res) => {
    try {
        const filters = { ...req.query };
        const user = req.user;

        // Staff-wise report is mainly for Managers
        if (user.role === ROLES.BRANCHMANAGER || user.role === ROLES.FINANCESTAFF) {
            filters.branch = user.branchId;
        } else if (user.role === ROLES.COUNTRYMANAGER) {
            filters.country = user.country;
        } else if (user.role === ROLES.ADMIN || user.role === ROLES.FINANCEADMIN || user.role === ROLES.OPERATIONADMIN) {
            // Admins can see anything
        } else {
            return res.status(403).json({ status: "error", message: "Unauthorized access to staff performance reports." });
        }

        if (!filters.branch && !filters.country && user.role !== ROLES.ADMIN) {
            return res.status(400).json({ status: "error", message: "Branch ID or Country is required for staff reports." });
        }

        const report = await ReportingService.getStaffPerformanceReport(filters);
        res.status(200).json({ status: "success", data: report });
    } catch (error) {
        res.status(500).json({ status: "error", message: error.message });
    }
};
