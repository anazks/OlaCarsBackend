const ReportingService = require("../Service/ReportingService");
const ReportingPdfService = require("../Service/ReportingPdfService");
const ReportingExcelService = require("../Service/ReportingExcelService");
const Branch = require("../../Branch/Model/BranchModel");
const { ROLES } = require("../../../shared/constants/roles");

const mongoose = require("mongoose");

exports.getDiag = async (req, res) => {
    try {
        const LedgerEntry = mongoose.model("LedgerEntry");
        const accountCodeId = '6a280dab4f5923cd64ec316d';

        // Group all entries by formatted date to see exactly where they landed
        const dateGroups = await LedgerEntry.aggregate([
            {
                $match: {
                    accountingCode: new mongoose.Types.ObjectId(accountCodeId)
                }
            },
            {
                $group: {
                    _id: { $dateToString: { format: "%Y-%m-%d", date: "$entryDate" } },
                    count: { $sum: 1 },
                    totalDebit: {
                        $sum: { $cond: [{ $eq: ["$type", "DEBIT"] }, "$amount", 0] }
                    },
                    totalCredit: {
                        $sum: { $cond: [{ $eq: ["$type", "CREDIT"] }, "$amount", 0] }
                    }
                }
            },
            { $sort: { _id: 1 } }
        ]);

        const fs = require('fs');
        const path = require('path');
        fs.writeFileSync(
            path.join(__dirname, '../../../../tmp/diag_output.json'),
            JSON.stringify({
                timestamp: new Date().toISOString(),
                accountCodeId,
                totalCount: dateGroups.reduce((acc, g) => acc + g.count, 0),
                dateGroups
            }, null, 2)
        );

        res.status(200).json({
            status: "success",
            totalCount: dateGroups.reduce((acc, g) => acc + g.count, 0),
            dateGroups
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.getBgDiagPublic = async (req, res) => {
    try {
        const AccountingCode = mongoose.model("AccountingCode");
        const LedgerEntry = mongoose.model("LedgerEntry");

        const allCodes = await AccountingCode.find({
            $or: [
                { accountType: { $in: ['Cash', 'Bank'] } },
                { name: /cash|bank|banco/i },
                { category: 'ASSET' }
            ]
        });

        const bgAccount = await AccountingCode.findOne({
            $or: [
                { name: /2654/ },
                { code: /2654/ }
            ]
        });

        if (bgAccount) {
            const bgEntries = await LedgerEntry.find({ accountingCode: bgAccount._id }).sort({ entryDate: 1, _id: 1 });
            let bal = 0;
            const bgMapped = bgEntries.map(e => {
                const amt = e.amount || 0;
                const sign = e.type === 'DEBIT' ? 1 : -1;
                bal += (amt * sign);
                return {
                    id: e._id,
                    entryDate: e.entryDate,
                    type: e.type,
                    amount: e.amount,
                    runningBalance: bal,
                    description: e.description,
                    createdAt: e.createdAt
                };
            });

            try {
                const fs = require('fs');
                const path = require('path');
                fs.writeFileSync(path.join(__dirname, '../../../../tmp/banco_general_debug.json'), JSON.stringify({
                    status: "success",
                    account: bgAccount,
                    balance: bal,
                    entriesCount: bgMapped.length,
                    entries: bgMapped
                }, null, 2));
            } catch (fErr) {
                console.error("Failed writing debug json:", fErr);
            }

            return res.status(200).json({
                status: "success",
                account: bgAccount,
                balance: bal,
                entriesCount: bgMapped.length,
                entries: bgMapped
            });
        } else {
            try {
                const fs = require('fs');
                const path = require('path');
                fs.writeFileSync(path.join(__dirname, '../../../../tmp/banco_general_debug.json'), JSON.stringify({
                    status: "error",
                    message: "Account containing 2654 not found",
                    allBankCodes: allCodes.map(c => ({ id: c._id, name: c.name, code: c.code, category: c.category, accountType: c.accountType }))
                }, null, 2));
            } catch (fErr) {
                console.error("Failed writing error debug json:", fErr);
            }

            return res.status(404).json({
                status: "error",
                message: "Account containing 2654 not found",
                allBankCodes: allCodes.map(c => ({ id: c._id, name: c.name, code: c.code, category: c.category, accountType: c.accountType }))
            });
        }
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
};

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

exports.getBankBalanceSheet = async (req, res) => {
    try {
        const filters = { ...req.query };
        const user = req.user;

        // Apply role-based restrictions
        if (user.role === ROLES.COUNTRYMANAGER) {
            filters.country = user.country;
        } else if (user.role === ROLES.BRANCHMANAGER || user.role === ROLES.FINANCESTAFF) {
            filters.branch = user.branchId;
        }

        const report = await ReportingService.getBankBalanceSheetReport(filters);
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
