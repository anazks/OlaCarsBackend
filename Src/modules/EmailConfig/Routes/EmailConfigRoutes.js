const express = require('express');
const router = express.Router();
const EmailConfigController = require('../Controller/EmailConfigController');
// const { protect, authorize } = require('../../../middleware/authMiddleware'); // Assuming these exist or similar

// Apply auth middleware if needed, for now keeping it simple as per user requests usually
router.post('/create', EmailConfigController.createEmailConfig);
router.get('/all', EmailConfigController.getAllConfigs);
router.put('/:id', EmailConfigController.updateConfig);
router.delete('/:id', EmailConfigController.deleteConfig);
router.put('/:id/assign', EmailConfigController.assignPurpose);

module.exports = router;
