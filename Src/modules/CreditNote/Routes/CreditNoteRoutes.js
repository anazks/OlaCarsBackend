const express = require('express');
const router = express.Router();
const CreditNoteController = require('../Controller/CreditNoteController');

router.post('/', CreditNoteController.createCreditNote);
router.get('/', CreditNoteController.getAllCreditNotes);
router.get('/:id', CreditNoteController.getCreditNoteById);
router.put('/:id', CreditNoteController.updateCreditNote);
router.delete('/:id', CreditNoteController.deleteCreditNote);

module.exports = router;
