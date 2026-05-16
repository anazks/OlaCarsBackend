const express = require('express');
const router = express.Router();
const PaymentReceivedController = require('../Controller/PaymentReceivedController');

router.post('/', PaymentReceivedController.createPaymentReceived);
router.get('/', PaymentReceivedController.getAllPaymentReceiveds);
router.get('/:id', PaymentReceivedController.getPaymentReceivedById);
router.put('/:id', PaymentReceivedController.updatePaymentReceived);
router.delete('/:id', PaymentReceivedController.deletePaymentReceived);

module.exports = router;
