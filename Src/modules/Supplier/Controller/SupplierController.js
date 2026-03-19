const SupplierService = require('../Service/SupplierService.js');

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

module.exports = {
    addSupplier,
    getSuppliers,
    getSupplierById,
    updateSupplier,
    deleteSupplier,
};
