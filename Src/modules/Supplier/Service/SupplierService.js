const Supplier = require('../Model/SupplierModel.js');
const filterBody = require('../../../shared/utils/filterBody.js');
const AppError = require('../../../shared/utils/AppError.js');

const ALLOWED_CREATE_FIELDS = ['name', 'contactPerson', 'email', 'phone', 'address', 'category', 'isActive'];
const ALLOWED_UPDATE_FIELDS = ['name', 'contactPerson', 'email', 'phone', 'address', 'category', 'isActive'];

exports.create = async (data) => {
    const filtered = filterBody(data, ...ALLOWED_CREATE_FIELDS);
    filtered.createdBy = data.createdBy;
    filtered.creatorRole = data.creatorRole;

    const newSupplier = await Supplier.create(filtered);
    return newSupplier.toObject();
};

exports.getAll = async (query = {}) => {
    const filters = { isDeleted: false, ...query };
    return await Supplier.find(filters).populate('createdBy', 'name email');
};

exports.getById = async (id) => {
    return await Supplier.findOne({ _id: id, isDeleted: false });
};

exports.update = async (id, body) => {
    const filtered = filterBody(body, ...ALLOWED_UPDATE_FIELDS);
    if (Object.keys(filtered).length === 0) {
        throw new AppError('No valid fields to update', 400);
    }

    const updated = await Supplier.findByIdAndUpdate(id, filtered, {
        new: true,
        runValidators: true,
    });

    if (!updated) throw new AppError('Supplier not found', 404);
    return updated;
};

exports.remove = async (id) => {
    const result = await Supplier.findByIdAndUpdate(
        id,
        { isDeleted: true, isActive: false },
        { new: true }
    );
    if (!result) throw new AppError('Supplier not found', 404);
    return result;
};
