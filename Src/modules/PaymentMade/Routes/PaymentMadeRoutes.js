const express = require('express');
const router = express.Router();
const PaymentMadeController = require('../Controller/PaymentMadeController');
const { authenticate } = require('../../../shared/middlewares/authMiddleware');

const upload = require('../../../utils/multerConfig');

router.use(authenticate);

router.post('/upload-attachment', upload.single('file'), PaymentMadeController.uploadAttachment);
router.post('/bulk-upload', PaymentMadeController.bulkUploadPaymentsMade);
router.post('/', PaymentMadeController.createPaymentMade);
router.get('/', PaymentMadeController.getAllPaymentMades);
router.get('/:id', PaymentMadeController.getPaymentMadeById);
router.put('/:id', PaymentMadeController.updatePaymentMade);
router.delete('/:id', PaymentMadeController.deletePaymentMade);

module.exports = router;
