const SupplierService = require('../Service/SupplierService.js');
const SupplierPdfService = require('../Service/SupplierPdfService.js');

const addSupplier = async (req, res) => {
    try {
        const data = { ...req.body };
        data.createdBy = req.user.id;
        data.creatorRole = req.user.role;
        const newSupplier = await SupplierService.create(data);
        return res.status(201).json({ success: true, data: newSupplier });
    } catch (error) {
        const statusCode = error.statusCode || 500;
        return res.status(statusCode).json({ success: false, message: error.message });
    }
};

const getSuppliers = async (req, res) => {
    try {
        const queryParams = { ...req.query };
        const result = await SupplierService.getAll(queryParams);
        return res.status(200).json({ 
            success: true, 
            data: result.data,
            pagination: {
                total: result.total,
                page: result.page,
                limit: result.limit,
                totalPages: result.totalPages
            }
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

const getSupplierById = async (req, res) => {
    try {
        const supplier = await SupplierService.getById(req.params.id);
        if (!supplier) return res.status(404).json({ success: false, message: 'Supplier not found' });
        return res.status(200).json({ success: true, data: supplier });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

const updateSupplier = async (req, res) => {
    try {
        const updatedSupplier = await SupplierService.update(req.params.id, req.body);
        return res.status(200).json({ success: true, data: updatedSupplier });
    } catch (error) {
        const statusCode = error.statusCode || 500;
        return res.status(statusCode).json({ success: false, message: error.message });
    }
};

const deleteSupplier = async (req, res) => {
    try {
        await SupplierService.remove(req.params.id);
        return res.status(200).json({ success: true, message: 'Supplier deleted successfully' });
    } catch (error) {
        const statusCode = error.statusCode || 500;
        return res.status(statusCode).json({ success: false, message: error.message });
    }
};

const downloadSupplierPdf = async (req, res) => {
    try {
        const supplier = await SupplierService.getById(req.params.id);
        if (!supplier) {
            return res.status(404).json({ success: false, message: "Supplier not found" });
        }

        res.setHeader("Content-Type", "application/pdf");
        res.setHeader(
            "Content-Disposition",
            `inline; filename="Supplier_${supplier.name?.replace(/\s+/g, '_') || req.params.id}.pdf"`
        );

        SupplierPdfService.generateSupplierPdf(supplier, res);
    } catch (error) {
        const statusCode = error.statusCode || 500;
        return res.status(statusCode).json({ success: false, message: error.message });
    }
};

const bulkAddSuppliers = async (req, res) => {
    try {
        const { suppliers } = req.body;

        if (!Array.isArray(suppliers) || suppliers.length === 0) {
            return res.status(400).json({ success: false, message: "Request body must contain a non-empty 'suppliers' array." });
        }

        if (suppliers.length > 500) {
            return res.status(400).json({ success: false, message: "Maximum 500 suppliers per bulk upload." });
        }

        const userId = req.user.id;
        const userRole = req.user.role;

        const results = await SupplierService.bulkCreate(suppliers, userId, userRole);

        const statusCode = results.created.length > 0 ? 201 : 400;
        return res.status(statusCode).json({
            success: results.created.length > 0,
            message: `${results.created.length} supplier(s) created, ${results.errors.length} error(s).`,
            data: results,
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = {
    addSupplier,
    getSuppliers,
    getSupplierById,
    updateSupplier,
    deleteSupplier,
    downloadSupplierPdf,
    bulkAddSuppliers,
};
