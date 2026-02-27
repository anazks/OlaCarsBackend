const AccountingCode = require("../Model/AccountingCodeModel");

exports.addAccountingCodeService = async (data) => {
    try {
        const newCode = await AccountingCode.create(data);
        return newCode.toObject();
    } catch (error) {
        if (error.code === 11000) {
            throw new Error(`An accounting code with this code already exists.`, { cause: 409 });
        }
        throw error;
    }
};

exports.getAccountingCodesService = async (query = {}) => {
    try {
        const filters = { isDeleted: false, ...query };
        return await AccountingCode.find(filters).populate("createdBy", "name email");
    } catch (error) {
        throw error;
    }
};

exports.getAccountingCodeByIdService = async (id) => {
    try {
        return await AccountingCode.findOne({ _id: id, isDeleted: false });
    } catch (error) {
        throw error;
    }
};

exports.updateAccountingCodeService = async (id, updateData) => {
    try {
        return await AccountingCode.findByIdAndUpdate(id, updateData, { new: true, runValidators: true });
    } catch (error) {
        if (error.code === 11000) {
            throw new Error(`An accounting code with this code already exists.`, { cause: 409 });
        }
        throw error;
    }
};

exports.deleteAccountingCodeService = async (id) => {
    try {
        return await AccountingCode.findByIdAndUpdate(id, { isDeleted: true, isActive: false }, { new: true });
    } catch (error) {
        throw error;
    }
};
