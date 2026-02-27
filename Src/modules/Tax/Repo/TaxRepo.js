const Tax = require("../Model/TaxModel");

exports.addTaxService = async (data) => {
    try {
        const newTax = await Tax.create(data);
        return newTax.toObject();
    } catch (error) {
        if (error.code === 11000) {
            throw new Error(`A tax with this name already exists.`, { cause: 409 });
        }
        throw error;
    }
};

exports.getTaxesService = async (query = {}) => {
    try {
        const filters = { isDeleted: false, ...query };
        return await Tax.find(filters).populate("createdBy", "name email");
    } catch (error) {
        throw error;
    }
};

exports.getTaxByIdService = async (id) => {
    try {
        return await Tax.findOne({ _id: id, isDeleted: false });
    } catch (error) {
        throw error;
    }
};

exports.updateTaxService = async (id, updateData) => {
    try {
        return await Tax.findByIdAndUpdate(id, updateData, { new: true, runValidators: true });
    } catch (error) {
        if (error.code === 11000) {
            throw new Error(`A tax with this name already exists.`, { cause: 409 });
        }
        throw error;
    }
};

exports.deleteTaxService = async (id) => {
    try {
        return await Tax.findByIdAndUpdate(id, { isDeleted: true, isActive: false }, { new: true });
    } catch (error) {
        throw error;
    }
};
