const InvoiceService = require("../Service/InvoiceService");

exports.getInvoices = async (req, res) => {
    try {
        const queryParams = req.query;
        const result = await InvoiceService.getAll(queryParams);
        return res.status(200).json({ success: true, message: "Invoices retrieved successfully", data: result });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

exports.getInvoiceById = async (req, res) => {
    try {
        const result = await InvoiceService.getById(req.params.id);
        return res.status(200).json({ success: true, message: "Invoice retrieved successfully", data: result });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

exports.createManualInvoice = async (req, res) => {
    try {
        const createdBy = req.user.id || req.user._id;
        const creatorRole = req.user.role;
        const result = await InvoiceService.createManualInvoice(req.body, createdBy, creatorRole);
        return res.status(201).json({ success: true, message: "Manual invoice created successfully", data: result });
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.payInvoice = async (req, res) => {
    try {
        const paymentData = {
            amount: parseFloat(req.body.amount),
            paymentMethod: req.body.paymentMethod,
            transactionId: req.body.transactionId,
            note: req.body.note,
            createdBy: req.user.id || req.user._id,
            creatorRole: req.user.role,
        };
        const result = await InvoiceService.payInvoice(req.params.id, paymentData);
        return res.status(200).json({ success: true, message: "Payment recorded successfully", data: result });
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.updateInvoice = async (req, res) => {
    try {
        const result = await InvoiceService.updateInvoice(req.params.id, req.body);
        return res.status(200).json({ success: true, message: "Invoice updated successfully", data: result });
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};
