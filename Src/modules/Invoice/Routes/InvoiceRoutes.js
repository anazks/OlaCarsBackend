const express = require("express");
const router = express.Router();
const InvoiceController = require("../Controller/InvoiceController");
const { authenticate } = require("../../../shared/middlewares/authMiddleware");

// Require authentication for all invoice routes
router.use(authenticate);

router.get("/registry", InvoiceController.getRegistryInvoices);
router.get("/driver/:driverId/pending", InvoiceController.getPendingInvoicesByDriver);
router.get("/", InvoiceController.getInvoices);
router.get("/:id", InvoiceController.getInvoiceById);
router.post("/", InvoiceController.createManualInvoice);
router.post("/:id/pay", InvoiceController.payInvoice);
router.put("/:id", InvoiceController.updateInvoice);

module.exports = router;
