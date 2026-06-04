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
router.get("/:id/pdf", InvoiceController.downloadInvoicePdf);
router.post("/", InvoiceController.createManualInvoice);
router.post("/bulk-upload", InvoiceController.bulkUploadInvoices);
router.post("/:id/pay", InvoiceController.payInvoice);
router.put("/:id", InvoiceController.updateInvoice);
router.post("/generate-weekly", InvoiceController.triggerWeeklyGeneration);
router.get("/settings/generation", InvoiceController.getGenerationSettings);
router.post("/settings/generation", InvoiceController.updateGenerationSettings);
router.delete("/all", InvoiceController.deleteAllInvoices);
router.delete("/:id", InvoiceController.deleteInvoice);

module.exports = router;
