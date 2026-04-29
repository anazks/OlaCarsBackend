const BankAccount = require("../Model/BankAccountModel");
const AppError = require("../../../shared/utils/AppError");

const createBankAccount = async (data) => {
    try {
        console.log("[BankAccountService] Creating account with data:", data);
        const account = new BankAccount(data);
        return await account.save();
    } catch (error) {
        console.error("[BankAccountService] Save failed:", error.message);
        if (error.name === 'ValidationError') {
            const messages = Object.values(error.errors).map(err => err.message);
            throw new AppError(`Validation failed: ${messages.join(', ')}`, 400);
        }
        if (error.code === 11000) {
            throw new AppError("Account number already exists", 400);
        }
        throw error;
    }
};

const getAllBankAccounts = async (query = {}) => {
    const filter = { isDeleted: false };
    if (query.status) filter.status = query.status;
    return await BankAccount.find(filter).sort({ createdAt: -1 });
};

const getBankAccountById = async (id) => {
    const account = await BankAccount.findOne({ _id: id, isDeleted: false });
    if (!account) throw new AppError("Bank account not found", 404);
    return account;
};

const updateBankAccount = async (id, data) => {
    const account = await BankAccount.findOneAndUpdate(
        { _id: id, isDeleted: false },
        data,
        { new: true, runValidators: true }
    );
    if (!account) throw new AppError("Bank account not found", 404);
    return account;
};

const deleteBankAccount = async (id) => {
    const account = await BankAccount.findOneAndUpdate(
        { _id: id, isDeleted: false },
        { isDeleted: true },
        { new: true }
    );
    if (!account) throw new AppError("Bank account not found", 404);
    return account;
};

const updateBalance = async (id, amountChange) => {
    const account = await BankAccount.findOneAndUpdate(
        { _id: id, isDeleted: false },
        { $inc: { currentBalance: amountChange } },
        { new: true }
    );
    if (!account) throw new AppError("Bank account not found", 404);
    return account;
};

module.exports = {
    createBankAccount,
    getAllBankAccounts,
    getBankAccountById,
    updateBankAccount,
    deleteBankAccount,
    updateBalance
};
