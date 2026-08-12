const DebitNoteService = require('../Service/DebitNoteService');

/**
 * @route POST /api/debit-notes
 */
exports.createDebitNote = async (req, res) => {
    try {
        const actor = { id: req.user.id, role: req.user.role };

        let debitNoteData = { ...req.body };

        // Handle optional file upload
        if (req.file) {
            const uploadLocal = require("../../../utils/uploadLocal");
            const fileUrl = uploadLocal(req.file, "debit-notes");
            debitNoteData.supportingDocument = {
                name: req.file.originalname,
                url: fileUrl,
                uploadedAt: new Date(),
            };
        }

        const savedDoc = await DebitNoteService.createDebitNote(debitNoteData, actor);
        res.status(201).json({ 
            success: true, 
            message: "Debit Note issued successfully.",
            data: savedDoc 
        });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

/**
 * @route PUT /api/debit-notes/:id/apply
 */
exports.applyDebitNote = async (req, res) => {
    try {
        const { invoiceId } = req.body;
        if (!invoiceId) {
            throw new Error("Target invoiceId is required to apply debit note.");
        }
        const doc = await DebitNoteService.applyDebitNoteToInvoice(req.params.id, invoiceId);
        res.status(200).json({ 
            success: true, 
            message: "Debit Note successfully applied to invoice.", 
            data: doc 
        });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

/**
 * @route GET /api/debit-notes
 */
exports.getAllDebitNotes = async (req, res) => {
    try {
        const { page, limit, driverId, customerId, supplierId, targetType, status, invoiceId, search, sortBy, sortOrder, startDate, endDate } = req.query;
        const filter = {};
        if (driverId) filter.driverId = driverId;
        if (customerId) filter.customerId = customerId;
        if (supplierId) filter.supplierId = supplierId;
        if (targetType === 'CUSTOMER') filter.customerId = { $exists: true, $ne: null };
        if (targetType === 'SUPPLIER') filter.supplierId = { $exists: true, $ne: null };
        if (status) filter.status = status;
        if (invoiceId) filter.invoiceId = invoiceId;

        const result = await DebitNoteService.getDebitNotes(filter, { page, limit, search, sortBy, sortOrder, startDate, endDate, supplierId });
        res.status(200).json({ 
            success: true, 
            data: result.data,
            pagination: {
                total: result.total,
                page: result.page,
                pages: result.pages
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * @route GET /api/debit-notes/:id
 */
exports.getDebitNoteById = async (req, res) => {
    try {
        const doc = await DebitNoteService.getDebitNoteById(req.params.id);
        if (!doc) return res.status(404).json({ success: false, message: 'Debit Note not found' });
        res.status(200).json({ success: true, data: doc });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * @route PUT /api/debit-notes/:id/void
 */
exports.voidDebitNote = async (req, res) => {
    try {
        const doc = await DebitNoteService.voidDebitNote(req.params.id);
        res.status(200).json({ success: true, message: 'Debit Note voided successfully', data: doc });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

/**
 * @route PUT /api/debit-notes/:id
 */
exports.updateDebitNote = async (req, res) => {
    try {
        const doc = await DebitNoteService.updateDebitNote(req.params.id, req.body);
        res.status(200).json({ success: true, message: 'Debit Note updated successfully', data: doc });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

/**
 * @route DELETE /api/debit-notes/:id
 */
exports.deleteDebitNote = async (req, res) => {
    try {
        const doc = await DebitNoteService.voidDebitNote(req.params.id);
        res.status(200).json({ success: true, message: 'Debit Note deleted/voided successfully', data: doc });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

/**
 * @route POST /api/debit-notes/bulk-upload
 */
exports.bulkUploadDebitNotes = async (req, res) => {
    try {
        const actor = { id: req.user.id, role: req.user.role };
        const { rows } = req.body;
        if (!Array.isArray(rows) || rows.length === 0) {
            return res.status(400).json({ success: false, message: "No valid rows provided for bulk upload." });
        }
        const result = await DebitNoteService.bulkUploadDebitNotes(rows, actor);
        res.status(201).json({
            success: true,
            message: `Successfully processed ${result.createdCount} Debit Notes.`,
            data: result
        });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};
