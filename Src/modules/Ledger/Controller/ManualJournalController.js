const ManualJournalService = require("../Service/ManualJournalService");
const LedgerEntry = require("../Model/LedgerEntryModel");

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

exports.getJournalById = async (req, res) => {
    try {
        const { id } = req.params;
        const { getManualJournalByIdRepo } = require("../Repo/ManualJournalRepo");
        const LedgerEntry = require("../Model/LedgerEntryModel");

        const journal = await getManualJournalByIdRepo(id);
        if (!journal) {
            return res.status(404).json({
                status: "error",
                message: "Manual journal not found"
            });
        }

        const lines = await LedgerEntry.find({ manualJournal: id })
            .populate("accountingCode", "code name category description isBank")
            .populate("contact", "name email")
            .populate("createdBy", "name email")
            .sort({ createdAt: 1 });

        res.status(200).json({
            status: "success",
            data: {
                journal,
                lines
            }
        });
    } catch (error) {
        res.status(error.statusCode || 500).json({
            status: "error",
            message: error.message
        });
    }
};

exports.deleteJournal = async (req, res) => {
    try {
        const { id } = req.params;
        const { getManualJournalByIdRepo, deleteManualJournalRepo } = require("../Repo/ManualJournalRepo");
        const { reverseSetOffFromHistory, syncAccountingCodeBalances } = require("../../BankAccount/Service/BankAccountService");

        const journal = await getManualJournalByIdRepo(id);
        if (!journal) {
            return res.status(404).json({
                status: "error",
                message: "Manual journal not found"
            });
        }

        // Find all child ledger entries to collect affected accounting codes & reverse set-offs
        const entries = await LedgerEntry.find({ manualJournal: id });
        const affectedCodeIds = new Set();
        for (const entry of entries) {
            if (entry.accountingCode) {
                affectedCodeIds.add(String(entry.accountingCode));
            }
            try {
                await reverseSetOffFromHistory(entry._id);
            } catch (revErr) {
                // Not all entries have set-off history
            }
        }

        // Delete all ledger entries
        const delEntries = await LedgerEntry.deleteMany({ manualJournal: id });

        // Delete the journal document
        await deleteManualJournalRepo(id);

        // Sync accounting code balances
        for (const codeId of affectedCodeIds) {
            try {
                await syncAccountingCodeBalances(codeId);
            } catch (syncErr) {
                console.error(`[ManualJournalController] Failed to sync balance for ${codeId}:`, syncErr);
            }
        }

        res.status(200).json({
            status: "success",
            message: `Manual journal and ${delEntries.deletedCount} associated ledger entries deleted successfully`,
            deletedEntries: delEntries.deletedCount
        });
    } catch (error) {
        res.status(error.statusCode || 500).json({
            status: "error",
            message: error.message
        });
    }
};

exports.bulkUploadJournals = async (req, res) => {
    try {
        const actor = {
            id: req.user.id,
            role: req.user.role,
            branchId: req.user.branchId
        };

        const result = await ManualJournalService.bulkUploadManualJournals(req.body, actor);

        const statusCode = result.createdCount > 0 ? 201 : 400;
        res.status(statusCode).json({
            status: result.success ? "success" : (result.createdCount > 0 ? "partial_success" : "error"),
            message: `Processed ${result.totalCount} journal entries: ${result.createdCount} created, ${result.failedCount} failed.`,
            data: result
        });
    } catch (error) {
        res.status(error.statusCode || 500).json({
            status: "error",
            message: error.message
        });
    }
};


