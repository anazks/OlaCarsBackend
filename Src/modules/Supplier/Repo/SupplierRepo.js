const Supplier = require("../Model/SupplierModel");

exports.addSupplierService = async (data) => {
    try {
        const newSupplier = await Supplier.create(data);
        return newSupplier.toObject();
    } catch (error) {
        if (error.code === 11000) {
            throw new Error("A supplier with this name already exists.", { cause: 409 });
        }
        throw error;
    }
};

exports.getSuppliersService = async (query = {}) => {
    try {
        // Default to active, non-deleted suppliers unless overridden
        const filters = { isDeleted: false, ...query };
        return await Supplier.find(filters).populate("createdBy", "name email");
    } catch (error) {
        throw error;
    }
};

exports.getSupplierByIdService = async (id) => {
    try {
        return await Supplier.findOne({ _id: id, isDeleted: false });
    } catch (error) {
        throw error;
    }
};

exports.updateSupplierService = async (id, updateData) => {
    try {
        return await Supplier.findByIdAndUpdate(id, updateData, { new: true, runValidators: true });
    } catch (error) {
        throw error;
    }
};

// Soft delete
exports.deleteSupplierService = async (id) => {
    try {
        return await Supplier.findByIdAndUpdate(id, { isDeleted: true, isActive: false }, { new: true });
    } catch (error) {
        throw error;
    }
};
