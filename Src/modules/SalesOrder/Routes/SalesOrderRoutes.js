const express = require('express');
const router = express.Router();
const SalesOrderController = require('../Controller/SalesOrderController');

router.post('/', SalesOrderController.createSalesOrder);
router.get('/', SalesOrderController.getAllSalesOrders);
router.get('/:id', SalesOrderController.getSalesOrderById);
router.put('/:id', SalesOrderController.updateSalesOrder);
router.delete('/:id', SalesOrderController.deleteSalesOrder);

module.exports = router;
