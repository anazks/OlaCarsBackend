const { getBills, getBillById } = require("../Repo/ServiceBillRepo");
const { generateFromWorkOrder, approveBill, addPayment, voidBill } = require("../Service/ServiceBillService");

/**
 * Generate a bill from a work order.
 * @route POST /api/service-bills
 */
const generateBillHandler = async (req, res) => {
    try {
        const { workOrderId, taxRate, hourlyRate, discount, notes } = req.body;
        if (!workOrderId) {
            return res.status(400).json({ success: false, message: "workOrderId is required" });
        }
        const bill = await generateFromWorkOrder(
            workOrderId,
            { taxRate, hourlyRate, discount, notes },
            req.user
        );
        return res.status(201).json({ success: true, data: bill });
    } catch (error) {
        const statusCode = error.cause || 500;
        return res.status(statusCode).json({ success: false, message: error.message });
    }
};

/**
 * Get all service bills.
 * @route GET /api/service-bills
 */
const getBillsHandler = async (req, res) => {
    try {
        const bills = await getBills(req.query);
        
        const billsWithInvoices = await Promise.all(bills.map(async (bill) => {
            const billObj = bill.toObject ? bill.toObject() : bill;
            if (billObj.isDriverBilled) {
                try {
                    const { Invoice } = require("../../Invoice/Model/InvoiceModel");
                    const invoice = await Invoice.findOne({ serviceBill: billObj._id });
                    if (invoice) {
                        billObj.invoiceNumber = invoice.invoiceNumber;
                        billObj.invoiceId = invoice._id;
                        billObj.invoiceStatus = invoice.status;
                    }
                } catch (invoiceErr) {
                    console.error("[ServiceBillController] Error fetching linked invoice:", invoiceErr);
                }
            }
            return billObj;
        }));
        
        return res.status(200).json({ success: true, data: billsWithInvoices });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Get a single bill by ID.
 * @route GET /api/service-bills/:id
 */
const getBillByIdHandler = async (req, res) => {
    try {
        const bill = await getBillById(req.params.id);
        if (!bill) return res.status(404).json({ success: false, message: "Bill not found" });
        
        const billObj = bill.toObject ? bill.toObject() : bill;
        if (billObj.isDriverBilled) {
            try {
                const { Invoice } = require("../../Invoice/Model/InvoiceModel");
                const invoice = await Invoice.findOne({ serviceBill: billObj._id });
                if (invoice) {
                    billObj.invoiceNumber = invoice.invoiceNumber;
                    billObj.invoiceId = invoice._id;
                    billObj.invoiceStatus = invoice.status;
                }
            } catch (invoiceErr) {
                console.error("[ServiceBillController] Error fetching linked invoice:", invoiceErr);
            }
        }
        
        return res.status(200).json({ success: true, data: billObj });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Approve a bill.
 * @route PUT /api/service-bills/:id/approve
 */
const approveBillHandler = async (req, res) => {
    try {
        const bill = await approveBill(req.params.id, req.user);
        return res.status(200).json({ success: true, data: bill });
    } catch (error) {
        const statusCode = error.cause || 500;
        return res.status(statusCode).json({ success: false, message: error.message });
    }
};

/**
 * Add a payment to a service bill.
 * @route POST /api/service-bills/:id/payments
 */
const addPaymentHandler = async (req, res) => {
    try {
        const bill = await addPayment(req.params.id, req.body, req.user);
        return res.status(200).json({ success: true, data: bill });
    } catch (error) {
        const statusCode = error.cause || 500;
        return res.status(statusCode).json({ success: false, message: error.message });
    }
};

/**
 * Void a bill.
 * @route PUT /api/service-bills/:id/void
 */
const voidBillHandler = async (req, res) => {
    try {
        const { reason } = req.body;
        const bill = await voidBill(req.params.id, reason);
        return res.status(200).json({ success: true, data: bill });
    } catch (error) {
        const statusCode = error.cause || 500;
        return res.status(statusCode).json({ success: false, message: error.message });
    }
};

module.exports = {
    generateBillHandler,
    getBillsHandler,
    getBillByIdHandler,
    approveBillHandler,
    addPaymentHandler,
    voidBillHandler,
};
