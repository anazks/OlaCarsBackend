const InvoiceService = require("../Service/InvoiceService");

exports.getInvoices = async (req, res) => {
    try {
        const queryParams = req.query;
        console.log('Invoice Query Params:', queryParams);
        const result = await InvoiceService.getAll(queryParams);
        return res.status(200).json({ 
            success: true, 
            message: "Invoices retrieved successfully", 
            data: result.data,
            pagination: result.pagination,
            metrics: result.metrics
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

exports.getRegistryInvoices = async (req, res) => {
    try {
        const result = await InvoiceService.getRegistry(req.query);
        console.log(`[InvoiceController] Retrieved ${result.data?.length || 0} registry invoices`);
        return res.status(200).json({ 
            success: true, 
            data: result.data,
            pagination: result.pagination,
            metrics: result.metrics
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

exports.getPendingInvoicesByDriver = async (req, res) => {
    try {
        const result = await InvoiceService.getPendingByDriver(req.params.driverId);
        return res.status(200).json({ success: true, data: result });
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

exports.getInvoicesCount = async (req, res) => {
    try {
        const count = await InvoiceService.getTotalCount();
        return res.status(200).json({ success: true, count });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

exports.getDateWiseInvoices = async (req, res) => {
    try {
        const result = await InvoiceService.getDateWise(req.query);
        console.log(`[InvoiceController] Retrieved ${result.data?.length || 0} date-wise invoices`);
        return res.status(200).json({ 
            success: true, 
            data: result.data,
            pagination: result.pagination,
            metrics: result.metrics
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

exports.createManualInvoice = async (req, res) => {
    try {
        const createdBy = req.user.id || req.user._id;
        const creatorRole = req.user.role;

        let invoiceData = { ...req.body };

        // Parse lineItems if it was sent as a string (from FormData)
        if (typeof invoiceData.lineItems === "string") {
            try {
                invoiceData.lineItems = JSON.parse(invoiceData.lineItems);
            } catch (err) {
                return res.status(400).json({ success: false, message: "Invalid JSON format for lineItems array." });
            }
        }

        // Handle optional file upload
        if (req.file) {
            const uploadLocal = require("../../../utils/uploadLocal");
            const fileUrl = uploadLocal(req.file, "invoices");
            invoiceData.supportingDocument = {
                name: req.file.originalname,
                url: fileUrl,
                uploadedAt: new Date(),
            };
        }

        const result = await InvoiceService.createManualInvoice(invoiceData, createdBy, creatorRole);
        return res.status(201).json({ success: true, message: "Manual invoice created successfully", data: result });
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.bulkUploadInvoices = async (req, res) => {
    try {
        const { rows, invoiceType } = req.body;
        if (!rows || !Array.isArray(rows) || rows.length === 0) {
            return res.status(400).json({ success: false, message: "No data rows provided for bulk upload." });
        }
        if (!invoiceType) {
            return res.status(400).json({ success: false, message: "Invoice type is required." });
        }
        const createdBy = req.user.id || req.user._id;
        const creatorRole = req.user.role;
        const result = await InvoiceService.bulkUploadInvoices(rows, invoiceType, createdBy, creatorRole);
        return res.status(201).json({ success: true, message: "Bulk upload completed", data: result });
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

exports.deleteInvoice = async (req, res) => {
    try {
        await InvoiceService.deleteInvoice(req.params.id);
        return res.status(200).json({ success: true, message: "Invoice deleted successfully" });
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.deleteAllInvoices = async (req, res) => {
    try {
        await InvoiceService.deleteAll();
        return res.status(200).json({ success: true, message: "All invoices deleted successfully" });
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.getGenerationSettings = async (req, res) => {
    try {
        const result = await InvoiceService.getGenerationSettings();
        return res.status(200).json({ success: true, data: result });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

exports.updateGenerationSettings = async (req, res) => {
    try {
        const result = await InvoiceService.updateGenerationSettings(req.body);
        return res.status(200).json({ success: true, message: "Generation settings updated", data: result });
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.triggerWeeklyGeneration = async (req, res) => {
    try {
        const result = await InvoiceService.triggerWeeklyGeneration(req.user._id, req.user.role);
        return res.status(200).json({ 
            success: true, 
            message: `Invoice generation complete. Created ${result.generatedCount} invoices.`,
            data: result 
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

exports.downloadInvoicePdf = async (req, res) => {
    try {
        const { Invoice } = require("../Model/InvoiceModel");
        const invoice = await Invoice.findById(req.params.id)
            .populate("driver", "personalInfo driverId")
            .populate("customer", "name email phone customerId")
            .populate("vehicle", "plateNumber make model basicDetails legalDocs");

        if (!invoice || invoice.isDeleted) {
            return res.status(404).json({ success: false, message: "Invoice not found" });
        }

        res.setHeader("Content-Type", "application/pdf");
        res.setHeader(
            "Content-Disposition",
            `inline; filename="Invoice-${invoice.invoiceNumber}.pdf"`
        );

        const InvoicePdfService = require("../Service/InvoicePdfService");
        InvoicePdfService.generateInvoicePdf(invoice, res);
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

exports.getReconfigProgress = async (req, res) => {
    try {
        const DriverService = require("../../Driver/Service/DriverService");
        const progress = DriverService.getReconfigProgress();
        return res.status(200).json({ success: true, data: progress });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};





























