const express = require('express');
const router = express.Router();
const RecurringTransactionController = require('../Controller/RecurringTransactionController');

router.post('/', RecurringTransactionController.createRecurringTransaction);
router.get('/', RecurringTransactionController.getAllRecurringTransactions);
router.get('/:id', RecurringTransactionController.getRecurringTransactionById);
router.put('/:id', RecurringTransactionController.updateRecurringTransaction);
router.delete('/:id', RecurringTransactionController.deleteRecurringTransaction);

module.exports = router;
