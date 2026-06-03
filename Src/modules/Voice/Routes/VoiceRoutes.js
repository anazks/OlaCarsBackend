const express = require('express');
const router = express.Router();
const voiceAgentAuth = require('../../../shared/middleware/voiceAgentAuth');
const {
    initiateCall,
    getAvailableVehicles,
    getLeaseSchemes,
    getAccountStatus,
    createLead,
    bookVehicle,
    logCall,
    getFollowUps,
    markFollowUpDone,
    testOutboundCall
} = require('../Controller/VoiceController');

// Local test only — no auth, blocked in production by the controller
router.post('/test-outbound', testOutboundCall);

router.use(voiceAgentAuth);

router.post('/initiate', initiateCall);
router.get('/vehicles/available', getAvailableVehicles);
router.get('/lease-schemes', getLeaseSchemes);
// Both paths hit the same handler so an empty customerId (".../account-status/")
// returns the friendly NO_ACCOUNT response instead of a generic 404.
router.get('/account-status', getAccountStatus);
router.get('/account-status/:customerId', getAccountStatus);
router.post('/leads', createLead);
router.post('/book-vehicle', bookVehicle);
router.post('/log-call', logCall);
router.get('/follow-ups', getFollowUps);
router.patch('/follow-ups/:logId/done', markFollowUpDone);

module.exports = router;
