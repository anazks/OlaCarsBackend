const express = require('express');
const router = express.Router();
const {
    addFleet,
    getFleets,
    getFleetById,
    updateFleet,
    deleteFleet,
    getNextFleetNumber
} = require('../Controller/FleetController');
const { authenticate } = require('../../../shared/middlewares/authMiddleware');
const { authorize } = require('../../../shared/middlewares/roleMiddleWare');
const { hasPermission } = require('../../../shared/middlewares/permissionMiddleware');
const validate = require('../../../shared/middlewares/validate');
const { ROLES } = require('../../../shared/constants/roles');
const {
    addFleetSchema,
    updateFleetSchema,
    getFleetByIdSchema
} = require('../Validation/FleetValidation');

// Fetch next available fleet number
router.get(
    '/next-number',
    authenticate,
    authorize(ROLES.ADMIN, ROLES.OPERATIONADMIN, ROLES.FINANCEADMIN, ROLES.BRANCHMANAGER, ROLES.COUNTRYMANAGER, ROLES.OPERATIONSTAFF, ROLES.FINANCESTAFF),
    getNextFleetNumber
);

// Get all fleets
router.get(
    '/',
    authenticate,
    authorize(ROLES.ADMIN, ROLES.OPERATIONADMIN, ROLES.FINANCEADMIN, ROLES.BRANCHMANAGER, ROLES.COUNTRYMANAGER, ROLES.OPERATIONSTAFF, ROLES.FINANCESTAFF),
    hasPermission('VEHICLE_VIEW'),
    getFleets
);

// Get fleet by ID
router.get(
    '/:id',
    authenticate,
    authorize(ROLES.ADMIN, ROLES.OPERATIONADMIN, ROLES.FINANCEADMIN, ROLES.BRANCHMANAGER, ROLES.COUNTRYMANAGER, ROLES.OPERATIONSTAFF, ROLES.FINANCESTAFF),
    hasPermission('VEHICLE_VIEW'),
    validate(getFleetByIdSchema),
    getFleetById
);

// Create new fleet
router.post(
    '/',
    authenticate,
    authorize(ROLES.ADMIN, ROLES.OPERATIONADMIN, ROLES.FINANCEADMIN, ROLES.BRANCHMANAGER, ROLES.COUNTRYMANAGER),
    hasPermission('VEHICLE_CREATE'),
    validate(addFleetSchema),
    addFleet
);

// Update fleet details or staff assignments
router.put(
    '/:id',
    authenticate,
    authorize(ROLES.ADMIN, ROLES.OPERATIONADMIN, ROLES.FINANCEADMIN, ROLES.BRANCHMANAGER, ROLES.COUNTRYMANAGER),
    hasPermission('VEHICLE_EDIT'),
    validate(updateFleetSchema),
    updateFleet
);

// Delete fleet
router.delete(
    '/:id',
    authenticate,
    authorize(ROLES.ADMIN, ROLES.OPERATIONADMIN, ROLES.FINANCEADMIN, ROLES.BRANCHMANAGER, ROLES.COUNTRYMANAGER),
    hasPermission('VEHICLE_EDIT'),
    validate(getFleetByIdSchema),
    deleteFleet
);

module.exports = router;
