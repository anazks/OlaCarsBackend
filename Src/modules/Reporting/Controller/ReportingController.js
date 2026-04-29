const ReportingService = require("../Service/ReportingService");

exports.getPL = async (req, res) => {
    try {
        const report = await ReportingService.getPLReport(req.query);
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
        const report = await ReportingService.getBalanceSheetReport(req.query);
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
