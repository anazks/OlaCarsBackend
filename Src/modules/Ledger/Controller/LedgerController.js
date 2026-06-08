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
        if (req.query.transaction) query.transaction = req.query.transaction;

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

        if (req.query.search) {
            let searchRegex;
            if (req.query.exact === "true" || req.query.exact === true) {
                const escapedSearch = req.query.search.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
                searchRegex = new RegExp('\\b' + escapedSearch + '\\b', 'i');
            } else {
                searchRegex = new RegExp(req.query.search, "i");
            }
            
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
            .populate("contact", "name email")
            .sort({ entryDate: -1 })
            .skip(skip)
            .limit(limit);

        // Calculate total summary stats for matching query using find + select to leverage Mongoose's schema casting
        const allMatching = await LedgerEntry.find(query).select("type amount");
        let totalDebit = 0;
        let totalCredit = 0;
        for (const entry of allMatching) {
            if (entry.type === "DEBIT") {
                totalDebit += entry.amount || 0;
            } else if (entry.type === "CREDIT") {
                totalCredit += entry.amount || 0;
            }
        }

        return res.status(200).json({ 
            success: true, 
            data: entries,
            summary: {
                totalDebit,
                totalCredit,
                netMovement: Math.abs(totalCredit - totalDebit)
            },
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

const getLedgerEntryById = async (req, res) => {
    try {
        const { id } = req.params;
        const entry = await LedgerEntry.findById(id)
            .populate("transaction")
            .populate("manualJournal")
            .populate("voucher")
            .populate("accountingCode", "code name category")
            .populate("contact", "name email")
            .populate("createdBy", "name email");

        if (!entry) {
            return res.status(404).json({ success: false, message: "Ledger entry not found" });
        }

        return res.status(200).json({ success: true, data: entry });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = {
    getLedgerEntries,
    getLedgerEntryById,
};
