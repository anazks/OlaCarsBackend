const voucherService = require("../Service/VoucherService");
const VoucherPdfService = require("../Service/VoucherPdfService");

/**
 * Create a new voucher.
 */
exports.createVoucher = async (req, res) => {
    try {
        const data = {
            ...req.body,
            createdBy: req.user._id || req.user.id,
            creatorRole: req.user.role
        };
        const result = await voucherService.createVoucher(data);
        res.status(201).json({
            status: "success",
            message: "Voucher created and posted successfully",
            data: result
        });
    } catch (error) {
        res.status(error.statusCode || 500).json({
            status: "error",
            message: error.message
        });
    }
};

/**
 * Get all vouchers with filtering.
 */
exports.getAllVouchers = async (req, res) => {
    try {
        const result = await voucherService.getAllVouchers(req.query);
        res.status(200).json({
            status: "success",
            message: "Vouchers retrieved successfully",
            data: result
        });
    } catch (error) {
        res.status(error.statusCode || 500).json({
            status: "error",
            message: error.message
        });
    }
};

/**
 * Get a single voucher by ID.
 */
exports.getVoucherById = async (req, res) => {
    try {
        const voucher = await voucherService.getVoucherById(req.params.id);
        res.status(200).json({
            status: "success",
            message: "Voucher retrieved successfully",
            data: voucher
        });
    } catch (error) {
        res.status(error.statusCode || 500).json({
            status: "error",
            message: error.message
        });
    }
};

/**
 * Download a voucher as PDF.
 */
exports.downloadVoucherPdf = async (req, res) => {
    try {
        const voucher = await voucherService.getVoucherById(req.params.id);
        
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader(
            "Content-Disposition",
            `inline; filename="Voucher_${voucher.voucherNumber || req.params.id}.pdf"`
        );

        VoucherPdfService.generateVoucherPdf(voucher, res);
    } catch (error) {
        res.status(error.statusCode || 500).json({
            status: "error",
            message: error.message
        });
    }
};
