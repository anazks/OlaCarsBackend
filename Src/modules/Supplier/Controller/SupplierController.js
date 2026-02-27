const {
    addSupplierService,
    getSuppliersService,
    getSupplierByIdService,
    updateSupplierService,
    deleteSupplierService,
} = require("../Repo/SupplierRepo");

const addSupplier = async (req, res) => {
    try {
        const supplierData = { ...req.body };
        supplierData.createdBy = req.user.id;
        supplierData.creatorRole = req.user.role;

        const newSupplier = await addSupplierService(supplierData);
        return res.status(201).json({ success: true, data: newSupplier });
    } catch (error) {
        const statusCode = error.cause || 500;
        return res.status(statusCode).json({ success: false, message: error.message });
    }
};

const getSuppliers = async (req, res) => {
    try {
        const query = {};
        if (req.query.category) query.category = req.query.category;
        if (req.query.isActive !== undefined) query.isActive = req.query.isActive === 'true';

        const suppliers = await getSuppliersService(query);
        return res.status(200).json({ success: true, data: suppliers });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

const getSupplierById = async (req, res) => {
    try {
        const supplier = await getSupplierByIdService(req.params.id);
        if (!supplier) {
            return res.status(404).json({ success: false, message: "Supplier not found" });
        }
        return res.status(200).json({ success: true, data: supplier });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

const updateSupplier = async (req, res) => {
    try {
        const updatedSupplier = await updateSupplierService(req.params.id, req.body);
        if (!updatedSupplier) {
            return res.status(404).json({ success: false, message: "Supplier not found" });
        }
        return res.status(200).json({ success: true, data: updatedSupplier });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

const deleteSupplier = async (req, res) => {
    try {
        const deletedSupplier = await deleteSupplierService(req.params.id);
        if (!deletedSupplier) {
            return res.status(404).json({ success: false, message: "Supplier not found" });
        }
        return res.status(200).json({ success: true, message: "Supplier deleted successfully" });
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
};
