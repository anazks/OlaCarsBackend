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

        // Date range filter (applied when search is not active, allowing explicit search to find records across all dates)
        if (!req.query.search && (req.query.startDate || req.query.endDate)) {
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

        // Search filter (matches description, journalNumber, or referenceNumber)
        if (req.query.search) {
            const searchRegex = new RegExp(req.query.search.trim(), "i");
            query.$or = [
                { description: searchRegex },
                { journalNumber: searchRegex },
                { referenceNumber: searchRegex }
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

        const isStreaming = req.headers.accept === 'application/x-ndjson' || 
                            req.query.stream === 'true' || 
                            req.body.stream === true;

        if (isStreaming) {
            req.setTimeout(900000);
            if (res.socket) res.socket.setTimeout(900000);

            res.status(200);
            res.setHeader('Content-Type', 'application/x-ndjson');
            res.setHeader('Transfer-Encoding', 'chunked');
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            res.setHeader('Connection', 'keep-alive');
            res.setHeader('X-Content-Type-Options', 'nosniff');
            if (typeof res.flushHeaders === 'function') res.flushHeaders();

            // Send initial 2KB comment padding to bypass proxy and browser response buffering immediately
            try {
                res.write(': ' + ' '.repeat(2048) + '\n');
                if (typeof res.flush === 'function') res.flush();
            } catch (e) {}

            const onProgress = (prog) => {
                try {
                    res.write(JSON.stringify(prog) + '\n');
                    if (typeof res.flush === 'function') res.flush();
                } catch (writeErr) { /* client disconnected */ }
            };

            const result = await ManualJournalService.bulkUploadManualJournals(req.body, actor, onProgress);

            const skippedCount = result.skippedCount || 0;
            try {
                res.write(JSON.stringify({
                    type: 'complete',
                    success: result.success,
                    message: `Processed ${result.totalCount} journal entries: ${result.createdCount} created, ${skippedCount} skipped (already exists), ${result.failedCount} failed.`,
                    totalCount: result.totalCount,
                    processedCount: result.totalCount,
                    insertedCount: result.createdCount,
                    skippedCount: skippedCount,
                    errorCount: result.failedCount,
                    percentage: 100,
                    statusMessage: `Upload complete: ${result.createdCount} created, ${skippedCount} skipped, ${result.failedCount} failed.`,
                    data: result
                }) + '\n');
                if (typeof res.flush === 'function') res.flush();
            } catch (writeErr) {}
            res.end();
            return;
        }

        const result = await ManualJournalService.bulkUploadManualJournals(req.body, actor);
        const skippedCount = result.skippedCount || 0;
        const statusCode = (result.createdCount > 0 || skippedCount > 0) ? 200 : 400;

        res.status(statusCode).json({
            status: result.success ? "success" : (result.createdCount > 0 || skippedCount > 0 ? "partial_success" : "error"),
            message: `Processed ${result.totalCount} journal entries: ${result.createdCount} created, ${skippedCount} skipped (already exists), ${result.failedCount} failed.`,
            data: result
        });
    } catch (error) {
        if (!res.headersSent) {
            res.status(error.statusCode || 500).json({
                status: "error",
                message: error.message
            });
        } else {
            try {
                res.write(JSON.stringify({ type: 'error', message: error.message || 'Upload failed' }) + '\n');
                res.end();
            } catch (e) {
                res.end();
            }
        }
    }
};

exports.updateJournal = async (req, res) => {
    try {
        const { id } = req.params;
        const result = await ManualJournalService.updateManualJournal(id, req.body);

        res.status(200).json({
            status: "success",
            success: true,
            message: "Manual journal updated successfully",
            data: result
        });
    } catch (error) {
        res.status(error.statusCode || 500).json({
            status: "error",
            success: false,
            message: error.message
        });
    }
};



