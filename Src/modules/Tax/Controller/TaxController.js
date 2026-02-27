const {
    addTaxService,
    getTaxesService,
    getTaxByIdService,
    updateTaxService,
    deleteTaxService,
} = require("../Repo/TaxRepo");

const addTax = async (req, res) => {
    try {
        const data = { ...req.body };
        data.createdBy = req.user.id;
        data.creatorRole = req.user.role;

        const newTax = await addTaxService(data);
        return res.status(201).json({ success: true, data: newTax });
    } catch (error) {
        const statusCode = error.cause || 500;
        return res.status(statusCode).json({ success: false, message: error.message });
    }
};

const getTaxes = async (req, res) => {
    try {
        const query = {};
        if (req.query.isActive !== undefined) query.isActive = req.query.isActive === 'true';

        const taxes = await getTaxesService(query);
        return res.status(200).json({ success: true, data: taxes });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

const getTaxById = async (req, res) => {
    try {
        const tax = await getTaxByIdService(req.params.id);
        if (!tax) {
            return res.status(404).json({ success: false, message: "Tax not found" });
        }
        return res.status(200).json({ success: true, data: tax });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

const updateTax = async (req, res) => {
    try {
        const updatedTax = await updateTaxService(req.params.id, req.body);
        if (!updatedTax) {
            return res.status(404).json({ success: false, message: "Tax not found" });
        }
        return res.status(200).json({ success: true, data: updatedTax });
    } catch (error) {
        const statusCode = error.cause || 500;
        return res.status(statusCode).json({ success: false, message: error.message });
    }
};

const deleteTax = async (req, res) => {
    try {
        const deletedTax = await deleteTaxService(req.params.id);
        if (!deletedTax) {
            return res.status(404).json({ success: false, message: "Tax not found" });
        }
        return res.status(200).json({ success: true, message: "Tax deleted successfully" });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = {
    addTax,
    getTaxes,
    getTaxById,
    updateTax,
    deleteTax,
};
