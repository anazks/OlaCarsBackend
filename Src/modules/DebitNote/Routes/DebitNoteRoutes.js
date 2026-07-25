const express = require('express');
const router = express.Router();
const DebitNoteController = require('../Controller/DebitNoteController');
const { authenticate } = require('../../../shared/middlewares/authMiddleware');
const upload = require('../../../utils/multerConfig');

// Require authentication for all debit note operations
router.use(authenticate);

router.post('/bulk-upload', DebitNoteController.bulkUploadDebitNotes);
router.post('/', upload.single('supportingDocument'), DebitNoteController.createDebitNote);
router.get('/', DebitNoteController.getAllDebitNotes);
router.get('/:id', DebitNoteController.getDebitNoteById);
router.put('/:id/void', DebitNoteController.voidDebitNote);
router.put('/:id/apply', DebitNoteController.applyDebitNote);
router.put('/:id', DebitNoteController.updateDebitNote);
router.delete('/:id', DebitNoteController.deleteDebitNote);

module.exports = router;
