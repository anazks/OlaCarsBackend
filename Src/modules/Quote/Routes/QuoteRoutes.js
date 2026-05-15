const express = require('express');
const router = express.Router();
const QuoteController = require('../Controller/QuoteController');

router.post('/', QuoteController.createQuote);
router.get('/', QuoteController.getAllQuotes);
router.get('/:id', QuoteController.getQuoteById);
router.put('/:id', QuoteController.updateQuote);
router.delete('/:id', QuoteController.deleteQuote);

module.exports = router;
