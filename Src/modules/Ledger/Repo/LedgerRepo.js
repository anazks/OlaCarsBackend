const LedgerEntry = require("../Model/LedgerEntryModel");

// STRICTLY NO UPDATE / DELETE LOGIC

exports.addLedgerEntryService = async (data) => {
    try {
        const newEntry = await LedgerEntry.create(data);
        return newEntry.toObject();
    } catch (error) {
        throw error;
    }
};

exports.getLedgerEntriesService = async (query = {}) => {
    try {
        return await LedgerEntry.find(query)
            .populate("transaction", "paymentMethod status transactionCategory transactionType")
            .populate("accountingCode", "code name category")
            .sort({ entryDate: -1 }); // Newest first
    } catch (error) {
        throw error;
    }
};
