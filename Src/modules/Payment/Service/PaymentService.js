const PaymentTransaction = require('../Model/PaymentTransactionModel.js');
const filterBody = require('../../../shared/utils/filterBody.js');
const AppError = require('../../../shared/utils/AppError.js');

const ALLOWED_CREATE_FIELDS = [
    'accountingCode', 'referenceId', 'referenceModel', 'transactionCategory',
    'transactionType', 'isTaxInclusive', 'baseAmount', 'taxApplied',
    'taxAmount', 'totalAmount', 'paymentMethod', 'status', 'paymentDate', 'notes'
];

exports.create = async (data) => {
    const filtered = filterBody(data, ...ALLOWED_CREATE_FIELDS);
    filtered.createdBy = data.createdBy;
    filtered.creatorRole = data.creatorRole;

    const newTransaction = await PaymentTransaction.create(filtered);
    return newTransaction.toObject();
};

exports.getAll = async (query = {}) => {
    return await PaymentTransaction.find(query)
        .populate('accountingCode', 'code name category')
        .populate('taxApplied', 'name rate')
        .populate('createdBy', 'name email');
};

exports.getById = async (id) => {
    return await PaymentTransaction.findById(id)
        .populate('accountingCode', 'code name category')
        .populate('taxApplied', 'name rate')
        .populate('createdBy', 'name email');
};

exports.updateStatus = async (id, status) => {
    const updated = await PaymentTransaction.findByIdAndUpdate(
        id,
        { status },
        { new: true, runValidators: true }
    );
    if (!updated) throw new AppError('Payment Transaction not found', 404);
    return updated;
};
