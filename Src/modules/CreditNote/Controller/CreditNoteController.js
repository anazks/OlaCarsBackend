const CreditNoteService = require('../Service/CreditNoteService');

/**
 * @route POST /api/credit-notes
 */
exports.createCreditNote = async (req, res) => {
    try {
        const actor = { id: req.user.id, role: req.user.role };
        const savedDoc = await CreditNoteService.createCreditNote(req.body, actor);
        res.status(201).json({ 
            success: true, 
            message: "Credit Note issued successfully in OPEN status.",
            data: savedDoc 
        });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

/**
 * @route PUT /api/credit-notes/:id/apply
 */
exports.applyCreditNote = async (req, res) => {
    try {
        const { invoiceId } = req.body;
        if (!invoiceId) {
            throw new Error("Target invoiceId is required to apply credit.");
        }
        const doc = await CreditNoteService.applyCreditNoteToInvoice(req.params.id, invoiceId);
        res.status(200).json({ 
            success: true, 
            message: "Credit successfully applied to invoice balance.", 
            data: doc 
        });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

/**
 * @route GET /api/credit-notes
 */
exports.getAllCreditNotes = async (req, res) => {
    try {
        const { page, limit, driverId, status, invoiceId, search, sortBy, sortOrder, startDate, endDate } = req.query;
        console.log('CreditNote Query Params:', { page, limit, driverId, status, invoiceId, search, sortBy, sortOrder, startDate, endDate });
        const filter = {};
        if (driverId) filter.driverId = driverId;
        if (status) filter.status = status;
        if (invoiceId) filter.invoiceId = invoiceId;

        const result = await CreditNoteService.getCreditNotes(filter, { page, limit, search, sortBy, sortOrder, startDate, endDate });
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
 * @route GET /api/credit-notes/:id
 */
exports.getCreditNoteById = async (req, res) => {
    try {
        const doc = await CreditNoteService.getCreditNoteById(req.params.id);
        if (!doc) return res.status(404).json({ success: false, message: 'Credit Note not found' });
        res.status(200).json({ success: true, data: doc });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * @route PUT /api/credit-notes/:id/void
 */
exports.voidCreditNote = async (req, res) => {
    try {
        const doc = await CreditNoteService.voidCreditNote(req.params.id);
        res.status(200).json({ success: true, message: "Credit note successfully voided and invoice reversed.", data: doc });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

/**
 * Updates an active Open Credit Note.
 */
exports.updateCreditNote = async (req, res) => {
    try {
        const doc = await CreditNoteService.updateCreditNote(req.params.id, req.body);
        res.status(200).json({ success: true, message: "Credit note successfully updated.", data: doc });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

/**
 * Delete calls void to maintain financial audit trail.
 */
exports.deleteCreditNote = async (req, res) => {
    try {
        const doc = await CreditNoteService.voidCreditNote(req.params.id);
        res.status(200).json({ success: true, message: 'Credit note voided (instead of physical deletion) for audit integrity.', data: doc });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

/**
 * Processes direct payout refund for a credit note.
 * @route PUT /api/credit-notes/:id/refund
 */
exports.refundCreditNote = async (req, res) => {
    try {
        const actor = { id: req.user.id, role: req.user.role };
        const doc = await CreditNoteService.refundCreditNote(req.params.id, actor);
        res.status(200).json({ 
            success: true, 
            message: "Credit note successfully refunded and cash ledger adjusted.", 
            data: doc 
        });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

