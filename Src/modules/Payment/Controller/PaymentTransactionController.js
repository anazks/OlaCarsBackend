const {
    addPaymentTransactionService,
    getPaymentTransactionsService,
    getPaymentTransactionByIdService,
    updatePaymentTransactionStatusService,
} = require("../Repo/PaymentTransactionRepo");
const { getTaxByIdService } = require("../../Tax/Repo/TaxRepo");
const { autoGenerateLedgerEntry } = require("../../Ledger/Service/LedgerService");
const { updatePurchaseOrderService, getPurchaseOrderByIdService } = require("../../PurchaseOrder/Repo/PurchaseOrderRepo");

const addPaymentTransaction = async (req, res) => {
    try {
        let paymentData = req.body;

        // Validation: Unique Bill for Purchase Order
        if (paymentData.referenceModel === "PurchaseOrder") {
            const po = await getPurchaseOrderByIdService(paymentData.referenceId);
            if (!po) {
                return res.status(404).json({ success: false, message: "Purchase Order not found." });
            }
            if (po.isBilled) {
                return res.status(400).json({ success: false, message: "A bill has already been registered for this Purchase Order." });
            }
            if (po.status !== "APPROVED") {
                return res.status(400).json({ success: false, message: "Bills can only be created for APPROVED Purchase Orders." });
            }
        }

        paymentData.createdBy = req.user.id;
        paymentData.creatorRole = req.user.role;

        // Validations for totalAmount and baseAmount based on isTaxInclusive
        let taxRate = 0;
        if (paymentData.taxApplied) {
            const taxDoc = await getTaxByIdService(paymentData.taxApplied);
            if (!taxDoc) return res.status(404).json({ success: false, message: "Tax profile not found." });
            taxRate = taxDoc.rate; // e.g. 5 for 5%
        }

        const rateDecimal = taxRate / 100;

        if (paymentData.isTaxInclusive) {
            // User provided totalAmount. Calculate base and tax.
            if (!paymentData.totalAmount) {
                return res.status(400).json({ success: false, message: "totalAmount is required when isTaxInclusive is true." });
            }
            paymentData.baseAmount = typeof paymentData.totalAmount === 'number'
                ? Number((paymentData.totalAmount / (1 + rateDecimal)).toFixed(2))
                : 0;
            paymentData.taxAmount = Number((paymentData.totalAmount - paymentData.baseAmount).toFixed(2));
        } else {
            // User provided baseAmount. Calculate tax and total.
            if (!paymentData.baseAmount) {
                return res.status(400).json({ success: false, message: "baseAmount is required when isTaxInclusive is false." });
            }
            paymentData.taxAmount = Number((paymentData.baseAmount * rateDecimal).toFixed(2));
            paymentData.totalAmount = Number((paymentData.baseAmount + paymentData.taxAmount).toFixed(2));
        }

        const newPayment = await addPaymentTransactionService(paymentData);

        // TRIGGER LEDGER ENTRY if created as COMPLETED
        if (newPayment.status === "COMPLETED") {
            await autoGenerateLedgerEntry(newPayment);
        }

        // Mark PO as billed if applicable
        if (paymentData.referenceModel === "PurchaseOrder") {
            await updatePurchaseOrderService(paymentData.referenceId, { isBilled: true });
        }

        return res.status(201).json({ success: true, data: newPayment });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

const getPaymentTransactions = async (req, res) => {
    try {
        const query = {};
        if (req.query.status) query.status = req.query.status;
        if (req.query.transactionCategory) query.transactionCategory = req.query.transactionCategory;
        if (req.query.transactionType) query.transactionType = req.query.transactionType;

        const payments = await getPaymentTransactionsService(query);
        return res.status(200).json({ success: true, data: payments });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

const getPaymentTransactionById = async (req, res) => {
    try {
        const payment = await getPaymentTransactionByIdService(req.params.id);
        if (!payment) {
            return res.status(404).json({ success: false, message: "Payment Transaction not found" });
        }
        return res.status(200).json({ success: true, data: payment });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

// Also handles Ledger triggering
const updatePaymentStatus = async (req, res) => {
    try {
        const paymentId = req.params.id;
        const { status } = req.body; // PENDING, COMPLETED, FAILED, CANCELLED

        const payment = await getPaymentTransactionByIdService(paymentId);
        if (!payment) {
            return res.status(404).json({ success: false, message: "Payment Transaction not found" });
        }

        if (payment.status === "COMPLETED") {
            return res.status(400).json({ success: false, message: "Payment is already completed. Status cannot be changed." });
        }

        const updatedPayment = await updatePaymentTransactionStatusService(paymentId, status);

        // TRIGGER LEDGER ENTRY
        if (status === "COMPLETED") {
            await autoGenerateLedgerEntry(updatedPayment);
        }

        return res.status(200).json({ success: true, data: updatedPayment });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = {
    addPaymentTransaction,
    getPaymentTransactions,
    getPaymentTransactionById,
    updatePaymentStatus,
};
