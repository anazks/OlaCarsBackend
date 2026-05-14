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

exports.getLedgerEntriesService = async (query = {}, page = null, limit = null) => {
    try {
        const mongoQuery = LedgerEntry.find(query)
            .populate("transaction", "paymentMethod status transactionCategory transactionType")
            .populate("accountingCode", "code name category")
            .sort({ entryDate: -1 }); // Newest first

        if (page && limit) {
            const skip = (page - 1) * limit;
            const [entries, total] = await Promise.all([
                mongoQuery.skip(skip).limit(limit),
                LedgerEntry.countDocuments(query)
            ]);
            return { entries, total };
        }

        const entries = await mongoQuery;
        return entries;
    } catch (error) {
        throw error;
    }
};
