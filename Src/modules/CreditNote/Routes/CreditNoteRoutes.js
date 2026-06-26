const express = require('express');
const router = express.Router();
const CreditNoteController = require('../Controller/CreditNoteController');
const { authenticate } = require('../../../shared/middlewares/authMiddleware');
const upload = require('../../../utils/multerConfig');

// Ensure authentication is required for all credit note operations
router.use(authenticate);

router.post('/bulk-upload', CreditNoteController.bulkUploadCreditNotes);
router.post('/', upload.single('supportingDocument'), CreditNoteController.createCreditNote);
router.get('/', CreditNoteController.getAllCreditNotes);
router.get('/:id/pdf', CreditNoteController.downloadCreditNotePdf);
router.get('/:id', CreditNoteController.getCreditNoteById);
router.put('/:id/void', CreditNoteController.voidCreditNote);
router.put('/:id/apply', CreditNoteController.applyCreditNote);
router.put('/:id/refund', CreditNoteController.refundCreditNote);
router.put('/:id', CreditNoteController.updateCreditNote);
router.delete('/:id', CreditNoteController.deleteCreditNote);

module.exports = router;
