const mongoose = require("mongoose");
const LedgerEntry = require("../Model/LedgerEntryModel");

const getLedgerEntries = async (req, res) => {
    try {
        let query = {};

        // Allowed filters
        if (req.query.accountingCode) query.accountingCode = req.query.accountingCode;
        if (req.query.type) query.type = req.query.type; 
        if (req.query.manualJournal) query.manualJournal = req.query.manualJournal;
        if (req.query.voucher) query.voucher = req.query.voucher;

        // Optional Branch Filter
        if (req.query.branch) query.branch = req.query.branch;

        if (req.query.startDate || req.query.endDate) {
            query.entryDate = {};
            if (req.query.startDate) query.entryDate.$gte = new Date(req.query.startDate);
            if (req.query.endDate) {
                const end = new Date(req.query.endDate);
                end.setHours(23, 59, 59, 999);
                query.entryDate.$lte = end;
            }
        }

        // Search Filter (matches description, creatorRole, or accounting code name/code)
        if (req.query.search) {
            const searchRegex = new RegExp(req.query.search, "i");
            
            // Query matching accounting codes first
            const AccountingCode = mongoose.model("AccountingCode");
            const matchingCodes = await AccountingCode.find({
                $or: [
                    { name: searchRegex },
                    { code: searchRegex }
                ]
            }).select("_id");

            query.$or = [
                { description: searchRegex },
                { creatorRole: searchRegex },
                { accountingCode: { $in: matchingCodes.map(c => c._id) } }
            ];
        }

        // Pagination parameters
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 25;
        const skip = (page - 1) * limit;

        // Fetch counts and paginated entries
        const total = await LedgerEntry.countDocuments(query);
        const pages = Math.ceil(total / limit);

        const entries = await LedgerEntry.find(query)
            .populate("transaction", "paymentMethod status transactionCategory transactionType")
            .populate("accountingCode", "code name category")
            .sort({ entryDate: -1 })
            .skip(skip)
            .limit(limit);

        return res.status(200).json({ 
            success: true, 
            data: entries,
            pagination: {
                total,
                page,
                limit,
                pages
            }
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = {
    getLedgerEntries,
};
