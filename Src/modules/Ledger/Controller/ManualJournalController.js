const ManualJournalService = require("../Service/ManualJournalService");

exports.createJournal = async (req, res) => {
    try {
        const journalData = {
            ...req.body,
            createdBy: req.user.id,
            creatorRole: req.user.role
        };

        const result = await ManualJournalService.createManualJournal(journalData);

        res.status(201).json({
            status: "success",
            data: result
        });
    } catch (error) {
        res.status(error.statusCode || 500).json({
            status: "error",
            message: error.message
        });
    }
};

exports.getJournals = async (req, res) => {
    try {
        let query = {};

        // Branch filter
        if (req.query.branch) {
            query.branch = req.query.branch;
        }

        // Status filter
        if (req.query.status) {
            query.status = req.query.status;
        }

        // Date range filter
        if (req.query.startDate || req.query.endDate) {
            query.date = {};
            if (req.query.startDate) query.date.$gte = new Date(req.query.startDate);
            if (req.query.endDate) {
                const end = new Date(req.query.endDate);
                end.setHours(23, 59, 59, 999);
                query.date.$lte = end;
            }
        }

        // Search filter (matches description or journalNumber)
        if (req.query.search) {
            const searchRegex = new RegExp(req.query.search, "i");
            query.$or = [
                { description: searchRegex },
                { journalNumber: searchRegex }
            ];
        }

        // Pagination parameters
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        const ManualJournal = require("../Model/ManualJournalModel");
        const total = await ManualJournal.countDocuments(query);
        const totalPages = Math.ceil(total / limit);

        const { getManualJournalsRepo } = require("../Repo/ManualJournalRepo");
        const journals = await getManualJournalsRepo(query, { 
            populate: "branch createdBy",
            skip,
            limit
        });

        res.status(200).json({
            status: "success",
            results: journals.length,
            data: journals,
            pagination: {
                total,
                page,
                limit,
                totalPages
            }
        });
    } catch (error) {
        res.status(error.statusCode || 500).json({
            status: "error",
            message: error.message
        });
    }
};
