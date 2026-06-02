const express = require('express');
const router = express.Router();
const { 
    login, 
    addMerchendise, 
    getMerchendise, 
    getMerchendiseById, 
    editMerchendise, 
    deleteMerchendise 
} = require('../Controller/MerchendiseController.js');

const { authenticate } = require('../../../shared/middlewares/authMiddleware.js');
const { authorize } = require('../../../shared/middlewares/roleMiddleWare.js');
const { ROLES } = require('../../../shared/constants/roles.js');
const validate = require('../../../shared/middlewares/validate.js');
const { loginSchema } = require('../Validation/MerchendiseValidation.js');

// Public Login Route
router.post('/login', validate(loginSchema), login);

// Protected CRUD routes
router.use(authenticate);
router.use(authorize(ROLES.ADMIN, ROLES.BRANCHMANAGER, ROLES.COUNTRYMANAGER, ROLES.OPERATIONADMIN));

router.post('/', addMerchendise);
router.get('/', getMerchendise);
router.get('/:id', getMerchendiseById);
router.put('/:id', editMerchendise);
router.delete('/:id', deleteMerchendise);

module.exports = router;
