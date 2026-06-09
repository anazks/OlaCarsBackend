const express = require('express');
const router = express.Router();
const CustomerController = require('../Controller/CustomerController');
const { authenticate } = require("../../../shared/middlewares/authMiddleware");
const { authorize } = require("../../../shared/middlewares/roleMiddleWare");
const { hasPermission } = require("../../../shared/middlewares/permissionMiddleware");
const { ROLES } = require("../../../shared/constants/roles");

const ALL_ROLES = Object.values(ROLES);

router.use(authenticate);

router.post('/', authorize(...ALL_ROLES), hasPermission('DRIVER_CREATE'), CustomerController.createCustomer);
router.post('/bulk', authorize(...ALL_ROLES), hasPermission('DRIVER_CREATE'), CustomerController.bulkCreateCustomers);
router.get('/', authorize(...ALL_ROLES), hasPermission('DRIVER_VIEW'), CustomerController.getAllCustomers);
router.get('/:id/statement/pdf', authorize(...ALL_ROLES), hasPermission('DRIVER_VIEW'), CustomerController.downloadStatementPdf);
router.get('/:id', authorize(...ALL_ROLES), hasPermission('DRIVER_VIEW'), CustomerController.getCustomerById);
router.put('/:id', authorize(...ALL_ROLES), hasPermission('DRIVER_EDIT'), CustomerController.updateCustomer);
router.delete('/:id', authorize(...ALL_ROLES), hasPermission('DRIVER_DELETE'), CustomerController.deleteCustomer);

module.exports = router;
