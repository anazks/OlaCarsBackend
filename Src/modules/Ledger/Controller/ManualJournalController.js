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
        const { getManualJournalsRepo } = require("../Repo/ManualJournalRepo");
        const journals = await getManualJournalsRepo(req.query, { populate: "branch createdBy" });

        res.status(200).json({
            status: "success",
            results: journals.length,
            data: journals
        });
    } catch (error) {
        res.status(error.statusCode || 500).json({
            status: "error",
            message: error.message
        });
    }
};
