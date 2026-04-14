const Branch = require('../Model/BranchModel.js');
const filterBody = require('../../../shared/utils/filterBody.js');
const AppError = require('../../../shared/utils/AppError.js');

const ALLOWED_CREATE_FIELDS = ['name', 'code', 'address', 'city', 'state', 'phone', 'email', 'status', 'country'];
const ALLOWED_UPDATE_FIELDS = ['name', 'address', 'city', 'state', 'phone', 'email', 'status', 'country'];

exports.create = async (data) => {
    const filtered = filterBody(data, ...ALLOWED_CREATE_FIELDS);
    filtered.createdBy = data.createdBy;
    filtered.creatorRole = data.creatorRole;

    const newBranch = await Branch.create(filtered);
    return newBranch;
};

const { getBranchesService } = require('../Repo/BranchRepo.js');

exports.getAll = async (queryParams = {}, options = {}) => {
    return await getBranchesService(queryParams, {
        baseQuery: { isDeleted: false },
        defaultSort: { createdAt: -1 },
        ...options
    });
};

exports.getById = async (id) => {
    return await Branch.findOne({ _id: id, isDeleted: false });
};

exports.update = async (id, body) => {
    const filtered = filterBody(body, ...ALLOWED_UPDATE_FIELDS);
    if (Object.keys(filtered).length === 0) {
        throw new AppError('No valid fields to update', 400);
    }

    const updated = await Branch.findByIdAndUpdate(id, filtered, {
        new: true,
        runValidators: true,
    });

    if (!updated) throw new AppError('Branch not found', 404);
    return updated;
};

exports.remove = async (id) => {
    const result = await Branch.findByIdAndUpdate(id, { isDeleted: true }, { new: true });
    if (!result) throw new AppError('Branch not found', 404);
};
