const SalaryService = require("../Service/SalaryService");

exports.getSalaryStructures = async (req, res) => {
    try {
        const structures = await SalaryService.getStaffSalaryStructures();
        res.status(200).json({ status: "success", data: structures });
    } catch (error) {
        res.status(error.statusCode || 500).json({ status: "error", message: error.message });
    }
};

exports.updateSalaryStructure = async (req, res) => {
    try {
        const structure = await SalaryService.updateSalaryStructure({
            ...req.body,
            updatedBy: req.user.id
        });
        res.status(200).json({ status: "success", data: structure });
    } catch (error) {
        res.status(error.statusCode || 500).json({ status: "error", message: error.message });
    }
};

exports.processPayroll = async (req, res) => {
    try {
        const result = await SalaryService.processPayroll({
            ...req.body,
            processedBy: req.user.id,
            processorRole: req.user.role
        });
        res.status(201).json({ status: "success", data: result });
    } catch (error) {
        res.status(error.statusCode || 500).json({ status: "error", message: error.message });
    }
};
