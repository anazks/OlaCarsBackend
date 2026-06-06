const AccountingCode = require('../Model/AccountingCodeModel.js');
const filterBody = require('../../../shared/utils/filterBody.js');
const AppError = require('../../../shared/utils/AppError.js');

const ALLOWED_CREATE_FIELDS = [
    'code', 'name', 'description', 'category', 'isActive',
    'accountType', 'mileageRate', 'mileageUnit', 'isMileage',
    'accountNumber', 'accountStatus', 'currency', 'parentAccount', 'cuentaEspanol'
];

const ALLOWED_UPDATE_FIELDS = [
    'code', 'name', 'description', 'category', 'isActive',
    'accountType', 'mileageRate', 'mileageUnit', 'isMileage',
    'accountNumber', 'accountStatus', 'currency', 'parentAccount', 'cuentaEspanol'
];

const mapAccountTypeToCategory = (accountType) => {
    if (!accountType) return 'ASSET';
    const type = accountType.trim().toLowerCase();
    switch (type) {
        case 'ncome':
        case 'income':
        case 'other income':
            return 'INCOME';
        case 'expense':
        case 'other expense':
        case 'cost of goods sold':
            return 'EXPENSE';
        case 'equity':
        case 'stock':
            return 'EQUITY';
        case 'liability':
        case 'other liability':
        case 'other current liability':
        case 'non current liability':
        case 'non current liab':
        case 'accounts payable':
        case 'output tax':
            return 'LIABILITY';
        case 'asset':
        case 'other asset':
        case 'other current asset':
        case 'fixed asset':
        case 'accounts receivable':
        case 'cash':
        case 'bank':
        case 'input tax':
            return 'ASSET';
        default:
            if (['income', 'expense', 'liability', 'asset', 'equity'].includes(type)) {
                return type.toUpperCase();
            }
            return 'ASSET';
    }
};

exports.mapAccountTypeToCategory = mapAccountTypeToCategory;

exports.create = async (data) => {
    const filtered = filterBody(data, ...ALLOWED_CREATE_FIELDS);
    filtered.createdBy = data.createdBy;
    filtered.creatorRole = data.creatorRole;

    if (filtered.accountType) {
        filtered.category = mapAccountTypeToCategory(filtered.accountType);
    } else if (filtered.category) {
        const mapped = mapAccountTypeToCategory(filtered.category);
        if (mapped !== filtered.category.toUpperCase()) {
            filtered.accountType = filtered.category;
            filtered.category = mapped;
        } else {
            filtered.category = filtered.category.toUpperCase();
            const categoryToType = {
                INCOME: 'Income',
                EXPENSE: 'Expense',
                ASSET: 'Asset',
                LIABILITY: 'Liability',
                EQUITY: 'Equity'
            };
            filtered.accountType = categoryToType[filtered.category] || 'Asset';
        }
    }

    const newCode = await AccountingCode.create(filtered);
    return newCode.toObject();
};

exports.getAll = async (query = {}) => {
    const filters = { isDeleted: false, ...query };
    return await AccountingCode.find(filters)
        .populate('createdBy', 'name email')
        .populate('parentAccount', 'code name');
};

exports.getById = async (id) => {
    return await AccountingCode.findOne({ _id: id, isDeleted: false })
        .populate('parentAccount', 'code name');
};

exports.update = async (id, body) => {
    const filtered = filterBody(body, ...ALLOWED_UPDATE_FIELDS);
    if (Object.keys(filtered).length === 0) {
        throw new AppError('No valid fields to update', 400);
    }

    if (filtered.accountType) {
        filtered.category = mapAccountTypeToCategory(filtered.accountType);
    } else if (filtered.category) {
        const mapped = mapAccountTypeToCategory(filtered.category);
        if (mapped !== filtered.category.toUpperCase()) {
            filtered.accountType = filtered.category;
            filtered.category = mapped;
        } else {
            filtered.category = filtered.category.toUpperCase();
        }
    }

    const updated = await AccountingCode.findByIdAndUpdate(id, filtered, {
        new: true,
        runValidators: true,
    });

    if (!updated) throw new AppError('Accounting Code not found', 404);
    return updated;
};

exports.remove = async (id) => {
    const result = await AccountingCode.findByIdAndUpdate(
        id,
        { isDeleted: true, isActive: false },
        { new: true }
    );
    if (!result) throw new AppError('Accounting Code not found', 404);
    return result;
};

exports.bulkUpsert = async (codesList, createdBy, creatorRole) => {
    const results = { created: [], updated: [], errors: [] };

    // Pass 1: Upsert all accounts (insert/update fields other than parentAccount)
    for (let i = 0; i < codesList.length; i++) {
        const row = codesList[i];
        const rowNum = i + 1;

        if (!row.code || !row.name) {
            results.errors.push({ row: rowNum, message: "Missing required fields: Account Code and Account Name are required." });
            continue;
        }

        try {
            const dataToSave = {
                code: String(row.code).trim(),
                name: String(row.name).trim(),
                description: row.description ? String(row.description).trim() : "",
                accountType: row.accountType ? String(row.accountType).trim() : "",
                mileageRate: row.mileageRate !== undefined && row.mileageRate !== "" ? Number(row.mileageRate) : 0,
                mileageUnit: row.mileageUnit ? String(row.mileageUnit).trim() : "",
                isMileage: row.isMileage === true || String(row.isMileage).toLowerCase() === 'true',
                accountNumber: row.accountNumber ? String(row.accountNumber).trim() : "",
                accountStatus: row.accountStatus ? String(row.accountStatus).trim() : "Active",
                currency: row.currency ? String(row.currency).trim() : "USD",
                cuentaEspanol: row.cuentaEspanol ? String(row.cuentaEspanol).trim() : "",
                isActive: row.accountStatus ? String(row.accountStatus).toLowerCase() === 'active' : true,
                isDeleted: false,
            };

            if (dataToSave.accountType) {
                dataToSave.category = mapAccountTypeToCategory(dataToSave.accountType);
            } else if (row.category) {
                const mapped = mapAccountTypeToCategory(row.category);
                if (mapped !== String(row.category).toUpperCase()) {
                    dataToSave.accountType = String(row.category).trim();
                    dataToSave.category = mapped;
                } else {
                    dataToSave.category = mapped;
                    const categoryToType = {
                        INCOME: 'Income',
                        EXPENSE: 'Expense',
                        ASSET: 'Asset',
                        LIABILITY: 'Liability',
                        EQUITY: 'Equity'
                    };
                    dataToSave.accountType = categoryToType[dataToSave.category] || 'Asset';
                }
            } else {
                dataToSave.category = 'ASSET';
                dataToSave.accountType = 'Asset';
            }

            const existing = await AccountingCode.findOne({ code: dataToSave.code });

            if (existing) {
                const updated = await AccountingCode.findByIdAndUpdate(existing._id, dataToSave, { new: true, runValidators: true });
                results.updated.push({ row: rowNum, id: updated._id, code: updated.code, name: updated.name });
            } else {
                dataToSave.createdBy = createdBy;
                dataToSave.creatorRole = creatorRole;
                const created = await AccountingCode.create(dataToSave);
                results.created.push({ row: rowNum, id: created._id, code: created.code, name: created.name });
            }
        } catch (err) {
            results.errors.push({ row: rowNum, message: err.message || "Failed to process row." });
        }
    }

    // Pass 2: Resolve parent account references
    const allDbCodes = await AccountingCode.find({ isDeleted: false });
    const codeMap = {};
    const nameMap = {};
    allDbCodes.forEach(item => {
        codeMap[item.code.toLowerCase()] = item._id;
        nameMap[item.name.toLowerCase()] = item._id;
    });

    for (let i = 0; i < codesList.length; i++) {
        const row = codesList[i];
        if (!row.code || !row.parentAccount) continue;

        const parentStr = String(row.parentAccount).trim().toLowerCase();
        if (!parentStr) continue;

        const parentId = codeMap[parentStr] || nameMap[parentStr];
        if (parentId) {
            try {
                await AccountingCode.findOneAndUpdate(
                    { code: String(row.code).trim() },
                    { parentAccount: parentId }
                );
            } catch (err) {
                console.error(`Failed to set parent for code ${row.code}: ${err.message}`);
            }
        }
    }

    return results;
};
