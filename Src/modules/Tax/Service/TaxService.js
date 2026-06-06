const Tax = require('../Model/TaxModel.js');
const filterBody = require('../../../shared/utils/filterBody.js');
const AppError = require('../../../shared/utils/AppError.js');

const ALLOWED_CREATE_FIELDS = ['name', 'rate', 'description', 'category', 'isActive'];
const ALLOWED_UPDATE_FIELDS = ['name', 'rate', 'description', 'category', 'isActive'];

exports.create = async (data) => {
    const filtered = filterBody(data, ...ALLOWED_CREATE_FIELDS);
    filtered.createdBy = data.createdBy;
    filtered.creatorRole = data.creatorRole;

    const newTax = await Tax.create(filtered);
    return newTax.toObject();
};

const { applyQueryFeatures } = require('../../../shared/utils/queryHelper');

exports.getAll = async (queryParams = {}) => {
    const queryOptions = {
        searchFields: ['name', 'description'],
        filterFields: ['isActive', 'category'],
        dateFilterField: 'createdAt',
        populate: [
            { path: 'createdBy', select: 'name email' }
        ],
        baseQuery: { isDeleted: false },
        defaultSort: { createdAt: -1 }
    };
    return await applyQueryFeatures(Tax, queryParams, queryOptions);
};

exports.getById = async (id) => {
    return await Tax.findOne({ _id: id, isDeleted: false });
};

exports.update = async (id, body) => {
    const filtered = filterBody(body, ...ALLOWED_UPDATE_FIELDS);
    if (Object.keys(filtered).length === 0) {
        throw new AppError('No valid fields to update', 400);
    }

    const oldTax = await Tax.findOne({ _id: id, isDeleted: false });
    if (!oldTax) throw new AppError('Tax not found', 404);

    const updated = await Tax.findByIdAndUpdate(id, filtered, {
        new: true,
        runValidators: true,
    });

    if (!updated) throw new AppError('Tax not found', 404);

    // If the rate has changed, trigger invoice tax recalculation for open invoices
    if (filtered.rate !== undefined && filtered.rate !== oldTax.rate) {
        try {
            const InvoiceService = require('../../Invoice/Service/InvoiceService');
            await InvoiceService.recalculateInvoicesForTax(updated._id, updated.rate);
        } catch (recalcErr) {
            console.error('[TaxService] Failed to recalculate invoices for updated tax:', recalcErr);
        }
    }

    return updated;
};

exports.remove = async (id) => {
    const result = await Tax.findByIdAndUpdate(
        id,
        { isDeleted: true, isActive: false },
        { new: true }
    );
    if (!result) throw new AppError('Tax not found', 404);
    return result;
};
