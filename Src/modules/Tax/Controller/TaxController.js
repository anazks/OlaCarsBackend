const TaxService = require('../Service/TaxService.js');

const addTax = async (req, res) => {
    try {
        const data = { ...req.body };
        data.createdBy = req.user.id;
        data.creatorRole = req.user.role;
        const newTax = await TaxService.create(data);
        return res.status(201).json({ success: true, data: newTax });
    } catch (error) {
        const statusCode = error.statusCode || 500;
        return res.status(statusCode).json({ success: false, message: error.message });
    }
};

const getTaxes = async (req, res) => {
    try {
        const result = await TaxService.getAll(req.query);
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

const getTaxById = async (req, res) => {
    try {
        const tax = await TaxService.getById(req.params.id);
        if (!tax) return res.status(404).json({ success: false, message: 'Tax not found' });
        return res.status(200).json({ success: true, data: tax });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

const updateTax = async (req, res) => {
    try {
        const updatedTax = await TaxService.update(req.params.id, req.body);
        return res.status(200).json({ success: true, data: updatedTax });
    } catch (error) {
        const statusCode = error.statusCode || 500;
        return res.status(statusCode).json({ success: false, message: error.message });
    }
};

const deleteTax = async (req, res) => {
    try {
        await TaxService.remove(req.params.id);
        return res.status(200).json({ success: true, message: 'Tax deleted successfully' });
    } catch (error) {
        const statusCode = error.statusCode || 500;
        return res.status(statusCode).json({ success: false, message: error.message });
    }
};

module.exports = {
    addTax,
    getTaxes,
    getTaxById,
    updateTax,
    deleteTax,
};
