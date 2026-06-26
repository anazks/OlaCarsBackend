const ReportingService = require("../Service/ReportingService");
const ReportingPdfService = require("../Service/ReportingPdfService");
const ReportingExcelService = require("../Service/ReportingExcelService");
const Branch = require("../../Branch/Model/BranchModel");
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

        const isAdminRole = [ROLES.ADMIN, ROLES.FINANCEADMIN, ROLES.OPERATIONADMIN].includes(user.role);
        if (!filters.branch && !filters.country && !isAdminRole) {
            return res.status(400).json({ status: "error", message: "Branch ID or Country is required for staff reports." });
        }

        const report = await ReportingService.getStaffPerformanceReport(filters);
        res.status(200).json({ status: "success", data: report });
    } catch (error) {
        res.status(500).json({ status: "error", message: error.message });
    }
};

exports.exportPdf = async (req, res) => {
    try {
        const filters = { ...req.query };
        const user = req.user;
        const reportType = filters.reportType || "PL";

        // Apply role-based restrictions
        if (user.role === ROLES.COUNTRYMANAGER) {
            filters.country = user.country;
        } else if (user.role === ROLES.BRANCHMANAGER || user.role === ROLES.FINANCESTAFF || user.role === ROLES.OPERATIONSTAFF) {
            filters.branch = user.branchId;
        }

        // Fetch report data based on type
        let reportData;
        if (reportType === "PL") {
            reportData = await ReportingService.getPLReport(filters);
        } else {
            reportData = await ReportingService.getBalanceSheetReport(filters);
        }

        // Gather metadata for PDF header
        let branchName = "";
        if (filters.branch) {
            const branch = await Branch.findById(filters.branch);
            if (branch) {
                branchName = `${branch.name} (${branch.country})`;
            }
        } else if (filters.country) {
            branchName = `Consolidated (${filters.country})`;
        } else {
            branchName = "Consolidated (All Branches)";
        }

        const meta = {
            branchName,
            startDate: filters.startDate,
            endDate: filters.endDate
        };

        // Set Headers
        res.setHeader("Content-Type", "application/pdf");
        const dateStr = new Date().toISOString().split('T')[0];
        const filename = reportType === "PL" ? `income_statement_report_${dateStr}.pdf` : `balance_sheet_report_${dateStr}.pdf`;
        res.setHeader("Content-Disposition", `inline; filename="${filename}"`);

        // Generate and stream PDF
        ReportingPdfService.generateReportPdf(reportType, reportData, meta, res);
    } catch (error) {
        res.status(500).json({
            status: "error",
            message: error.message
        });
    }
};

exports.exportExcel = async (req, res) => {
    try {
        const filters = { ...req.query };
        const user = req.user;
        const reportType = filters.reportType || "expenses";

        // Apply role-based restrictions
        if (user.role === ROLES.COUNTRYMANAGER) {
            filters.country = user.country;
        } else if (user.role === ROLES.BRANCHMANAGER || user.role === ROLES.FINANCESTAFF || user.role === ROLES.OPERATIONSTAFF) {
            filters.branch = user.branchId;
        }

        const { buffer } = await ReportingExcelService.generateExcelReport(reportType, filters);

        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        const dateStr = new Date().toISOString().split('T')[0];
        const filename = `${reportType}_report_${dateStr}.xlsx`;
        res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
        res.send(buffer);
    } catch (error) {
        res.status(500).json({
            status: "error",
            message: error.message
        });
    }
};
