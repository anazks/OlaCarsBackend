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

const { applyQueryFeatures } = require('../../../shared/utils/queryHelper');

exports.getAll = async (queryParams = {}) => {
    // Ensure special fixed asset accounts exist
    try {
        const count = await AccountingCode.countDocuments({
            code: { $in: ["1210-VEH-DEP", "5010-VEH-DEP", "1200-VEH", "1200-GEN", "1210-GEN-DEP", "5010-GEN-DEP"] },
            isDeleted: false
        });
        if (count < 6) {
            const defaultCreator = "507f1f77bcf86cd799439011";
            const defaultRole = "ADMIN";

            // 1. Vehicle Accumulated Depreciation
            const vehicleAccumDep = await AccountingCode.findOne({ code: "1210-VEH-DEP" });
            if (!vehicleAccumDep) {
                await AccountingCode.create({
                    code: "1210-VEH-DEP",
                    name: "Acumulated Depretiacion of Vehicles/Depreciación Acumulada de Vehículos",
                    category: "ASSET",
                    accountType: "fixed asset",
                    description: "Contra-asset account for vehicle accumulated depreciation",
                    currency: "USD",
                    createdBy: defaultCreator,
                    creatorRole: defaultRole
                });
            } else if (vehicleAccumDep.isDeleted) {
                await AccountingCode.findByIdAndUpdate(vehicleAccumDep._id, { isDeleted: false, isActive: true });
            }

            // 2. Vehicle Depreciation Expense
            const vehicleDepExp = await AccountingCode.findOne({ code: "5010-VEH-DEP" });
            if (!vehicleDepExp) {
                await AccountingCode.create({
                    code: "5010-VEH-DEP",
                    name: "DEPRECIATION OF VEHICLES",
                    category: "EXPENSE",
                    accountType: "expense",
                    description: "Depreciation expense for vehicles",
                    currency: "USD",
                    createdBy: defaultCreator,
                    creatorRole: defaultRole
                });
            } else if (vehicleDepExp.isDeleted) {
                await AccountingCode.findByIdAndUpdate(vehicleDepExp._id, { isDeleted: false, isActive: true });
            }

            // 3. Vehicles Fixed Asset Account
            const vehicleAsset = await AccountingCode.findOne({ code: "1200-VEH" });
            if (!vehicleAsset) {
                await AccountingCode.create({
                    code: "1200-VEH",
                    name: "Vehicles/Vehículos",
                    category: "ASSET",
                    accountType: "fixed asset",
                    description: "Fixed asset account for vehicles",
                    currency: "USD",
                    createdBy: defaultCreator,
                    creatorRole: defaultRole
                });
            } else if (vehicleAsset.isDeleted) {
                await AccountingCode.findByIdAndUpdate(vehicleAsset._id, { isDeleted: false, isActive: true });
            }

            // 4. General Fixed Asset Account
            const generalAsset = await AccountingCode.findOne({ code: "1200-GEN" });
            if (!generalAsset) {
                await AccountingCode.create({
                    code: "1200-GEN",
                    name: "General Fixed Assets",
                    category: "ASSET",
                    accountType: "fixed asset",
                    description: "General fixed asset account",
                    currency: "USD",
                    createdBy: defaultCreator,
                    creatorRole: defaultRole
                });
            } else if (generalAsset.isDeleted) {
                await AccountingCode.findByIdAndUpdate(generalAsset._id, { isDeleted: false, isActive: true });
            }

            // 5. General Accumulated Depreciation
            const generalAccumDep = await AccountingCode.findOne({ code: "1210-GEN-DEP" });
            if (!generalAccumDep) {
                await AccountingCode.create({
                    code: "1210-GEN-DEP",
                    name: "Accumulated Depreciation of General Assets",
                    category: "ASSET",
                    accountType: "fixed asset",
                    description: "Contra-asset account for general accumulated depreciation",
                    currency: "USD",
                    createdBy: defaultCreator,
                    creatorRole: defaultRole
                });
            } else if (generalAccumDep.isDeleted) {
                await AccountingCode.findByIdAndUpdate(generalAccumDep._id, { isDeleted: false, isActive: true });
            }

            // 6. General Depreciation Expense
            const generalDepExp = await AccountingCode.findOne({ code: "5010-GEN-DEP" });
            if (!generalDepExp) {
                await AccountingCode.create({
                    code: "5010-GEN-DEP",
                    name: "Depreciation Expense",
                    category: "EXPENSE",
                    accountType: "expense",
                    description: "Depreciation expense account",
                    currency: "USD",
                    createdBy: defaultCreator,
                    creatorRole: defaultRole
                });
            } else if (generalDepExp.isDeleted) {
                await AccountingCode.findByIdAndUpdate(generalDepExp._id, { isDeleted: false, isActive: true });
            }
        }
    } catch (err) {
        console.error("[AccountingCodeService] Failed to seed special accounts:", err);
    }

    const queryOptions = {
        searchFields: ['code', 'name', 'accountNumber', 'cuentaEspanol', 'description'],
        filterFields: ['category', 'isActive', 'accountType', 'accountStatus'],
        dateFilterField: 'createdAt',
        populate: [
            { path: 'createdBy', select: 'name email' },
            { path: 'parentAccount', select: 'code name' }
        ],
        baseQuery: { isDeleted: false },
        defaultSort: { code: 1 }
    };
    return await applyQueryFeatures(AccountingCode, queryParams, queryOptions);
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
