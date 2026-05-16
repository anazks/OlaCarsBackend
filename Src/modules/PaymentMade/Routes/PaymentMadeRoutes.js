const express = require('express');
const router = express.Router();
const PaymentMadeController = require('../Controller/PaymentMadeController');

router.post('/', PaymentMadeController.createPaymentMade);
router.get('/', PaymentMadeController.getAllPaymentMades);
router.get('/:id', PaymentMadeController.getPaymentMadeById);
router.put('/:id', PaymentMadeController.updatePaymentMade);
router.delete('/:id', PaymentMadeController.deletePaymentMade);

module.exports = router;
