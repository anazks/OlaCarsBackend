const { getLedgerEntriesService } = require("../Repo/LedgerRepo");

const getLedgerEntries = async (req, res) => {
    try {
        let query = {};

        // Allowed filters
        if (req.query.accountingCode) query.accountingCode = req.query.accountingCode;
        if (req.query.type) query.type = req.query.type; 

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

        const entries = await getLedgerEntriesService(query);
        return res.status(200).json({ success: true, data: entries });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = {
    getLedgerEntries,
};
