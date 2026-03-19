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

const { applyQueryFeatures } = require("../../../shared/utils/queryHelper");

/**
 * Retrieves all suppliers using generic query features.
 * @param {Object} queryParams - Raw query parameters from req.query.
 * @param {Object} [options={}] - Additional options like baseQuery.
 * @returns {Promise<Object>} Paginated result
 */
exports.getSuppliersService = async (queryParams = {}, options = {}) => {
    try {
        const queryOptions = {
            searchFields: ["name", "contactPerson", "email"],
            filterFields: ["category", "isActive"],
            dateFilterField: "createdAt",
            populate: { path: "createdBy", select: "name email" },
            ...options
        };

        return await applyQueryFeatures(Supplier, queryParams, queryOptions);
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
