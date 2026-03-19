const PaymentTransaction = require("../Model/PaymentTransactionModel");

exports.addPaymentTransactionService = async (data) => {
    try {
        const newTransaction = await PaymentTransaction.create(data);
        return newTransaction.toObject();
    } catch (error) {
        throw error;
    }
};

exports.getPaymentTransactionsService = async (query = {}) => {
    try {
        return await PaymentTransaction.find(query)
            .populate("accountingCode", "code name category")
            .populate("taxApplied", "name rate")
            .populate("createdBy", "name email");
    } catch (error) {
        throw error;
    }
};

exports.getPaymentTransactionByIdService = async (id) => {
    try {
        return await PaymentTransaction.findById(id)
            .populate("accountingCode", "code name category")
            .populate("taxApplied", "name rate")
            .populate("createdBy", "name email");
    } catch (error) {
        throw error;
    }
};

exports.updatePaymentTransactionStatusService = async (id, status) => {
    try {
        return await PaymentTransaction.findByIdAndUpdate(
            id,
            { status },
            { new: true, runValidators: true }
        ).populate("accountingCode", "code name category");
    } catch (error) {
        throw error;
    }
};
