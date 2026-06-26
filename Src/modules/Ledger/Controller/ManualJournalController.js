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
            if (req.query.startDate) {
                const startStr = req.query.startDate.includes("T") ? req.query.startDate : `${req.query.startDate}T00:00:00.000Z`;
                query.date.$gte = new Date(startStr);
            }
            if (req.query.endDate) {
                const endStr = req.query.endDate.includes("T") ? req.query.endDate : `${req.query.endDate}T23:59:59.999Z`;
                query.date.$lte = new Date(endStr);
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
