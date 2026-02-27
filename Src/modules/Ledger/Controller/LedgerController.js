const { getLedgerEntriesService } = require("../Repo/LedgerRepo");

const getLedgerEntries = async (req, res) => {
    try {
        let query = {};

        // Allowed filters
        if (req.query.accountingCode) query.accountingCode = req.query.accountingCode;
        if (req.query.type) query.type = req.query.type; // CREDIT or DEBIT

        const entries = await getLedgerEntriesService(query);
        return res.status(200).json({ success: true, data: entries });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = {
    getLedgerEntries,
};
