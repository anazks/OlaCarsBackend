const PurchaseOrder = require('../Model/PurchaseOrderModel.js');
const filterBody = require('../../../shared/utils/filterBody.js');
const AppError = require('../../../shared/utils/AppError.js');

const ALLOWED_CREATE_FIELDS = [
    'purchaseOrderNumber', 'items', 'totalAmount',
    'purchaseOrderDate', 'paymentDate', 'branch', 'supplier'
];
const ALLOWED_UPDATE_FIELDS = ['items', 'totalAmount', 'paymentDate', 'supplier'];

exports.create = async (data) => {
    const filtered = filterBody(data, ...ALLOWED_CREATE_FIELDS);
    filtered.createdBy = data.createdBy;
    filtered.creatorRole = data.creatorRole;

    const newPO = await PurchaseOrder.create(filtered);
    return newPO.toObject();
};

exports.getAll = async (query = {}) => {
    return await PurchaseOrder.find(query)
        .populate('branch')
        .populate('supplier', 'name contactPerson email');
};

exports.getById = async (id) => {
    return await PurchaseOrder.findById(id)
        .populate('branch')
        .populate('supplier', 'name contactPerson email')
        .populate('createdBy', 'name email');
};

exports.update = async (id, body) => {
    const filtered = filterBody(body, ...ALLOWED_UPDATE_FIELDS);
    if (Object.keys(filtered).length === 0) {
        throw new AppError('No valid fields to update', 400);
    }

    const updated = await PurchaseOrder.findByIdAndUpdate(id, filtered, {
        new: true,
        runValidators: true,
    });

    if (!updated) throw new AppError('Purchase Order not found', 404);
    return updated;
};

exports.updateStatus = async (id, status, approvedBy, approverRole) => {
    const updated = await PurchaseOrder.findByIdAndUpdate(
        id,
        { status, approvedBy, approverRole },
        { new: true }
    );
    if (!updated) throw new AppError('Purchase Order not found', 404);
    return updated;
};
