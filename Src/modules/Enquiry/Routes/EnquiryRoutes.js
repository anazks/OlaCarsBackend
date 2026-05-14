const express = require('express');
console.log('EnquiryRoutes loaded');
const router = express.Router();
const EnquiryController = require('../Controller/EnquiryController');

const { authenticate, optionalAuthenticate } = require('../../../shared/middlewares/authMiddleware');

router.post('/register', optionalAuthenticate, EnquiryController.registerEnquiry);
router.get('/', authenticate, EnquiryController.getEnquiries);
router.get('/my-complaints', authenticate, EnquiryController.getMyComplaints);

module.exports = router;
