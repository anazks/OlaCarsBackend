const express = require('express');
const router = express.Router();
const VendorCreditController = require('../Controller/VendorCreditController');

router.post('/', VendorCreditController.createVendorCredit);
router.get('/', VendorCreditController.getAllVendorCredits);
router.get('/:id', VendorCreditController.getVendorCreditById);
router.put('/:id', VendorCreditController.updateVendorCredit);
router.delete('/:id', VendorCreditController.deleteVendorCredit);

module.exports = router;
