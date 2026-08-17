const SupplierService = require('../Service/SupplierService.js');
const SupplierPdfService = require('../Service/SupplierPdfService.js');

const addSupplier = async (req, res) => {
    try {
        const data = { ...req.body };
        data.createdBy = req.user.id;
        data.creatorRole = req.user.role;
        const newSupplier = await SupplierService.create(data);
        return res.status(201).json({ success: true, data: newSupplier });
    } catch (error) {
        const statusCode = error.statusCode || 500;
        return res.status(statusCode).json({ success: false, message: error.message });
    }
};

const getSuppliers = async (req, res) => {
    try {
        const queryParams = { ...req.query };
        const result = await SupplierService.getAll(queryParams);
        return res.status(200).json({ 
            success: true, 
            data: result.data,
            pagination: {
                total: result.total,
                page: result.page,
                limit: result.limit,
                totalPages: result.totalPages
            }
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

const getSupplierById = async (req, res) => {
    try {
        const supplier = await SupplierService.getById(req.params.id);
        if (!supplier) return res.status(404).json({ success: false, message: 'Supplier not found' });
        return res.status(200).json({ success: true, data: supplier });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

const updateSupplier = async (req, res) => {
    try {
        const updatedSupplier = await SupplierService.update(req.params.id, req.body);
        return res.status(200).json({ success: true, data: updatedSupplier });
    } catch (error) {
        const statusCode = error.statusCode || 500;
        return res.status(statusCode).json({ success: false, message: error.message });
    }
};

const deleteSupplier = async (req, res) => {
    try {
        await SupplierService.remove(req.params.id);
        return res.status(200).json({ success: true, message: 'Supplier deleted successfully' });
    } catch (error) {
        const statusCode = error.statusCode || 500;
        return res.status(statusCode).json({ success: false, message: error.message });
    }
};

const PaymentMade = require("../../PaymentMade/Model/PaymentMadeModel");
const Bill = require("../../Bill/Model/BillModel");
const LedgerEntry = require("../../Ledger/Model/LedgerEntryModel");

const downloadSupplierPdf = async (req, res) => {
    try {
        const supplier = await SupplierService.getById(req.params.id);
        if (!supplier) {
            return res.status(404).json({ success: false, message: "Supplier not found" });
        }

        const id = supplier._id;

        // 1. Fetch Bills & Payments for this supplier
        const bills = await Bill.find({ supplier: id }).lean();
        const payments = await PaymentMade.find({ supplier: id }).lean();

        const statementRows = [];

        // Add Bills (Billed Liability)
        bills.forEach(b => {
            statementRows.push({
                id: `bill-${b._id}`,
                date: new Date(b.billDate || b.createdAt),
                type: 'bill',
                transactionLabel: 'Supplier Bill',
                ref: b.billNumber || 'BILL',
                details: `Invoiced (${b.items?.length || 0} line items)`,
                billed: b.totalAmount || 0,
                paid: 0
            });
        });

        // Add Vendor Payments (Paid Disbursed)
        payments.forEach(p => {
            const pmtRef = p.paymentNumber || p.paymentCode || p.referenceNumber || `PMT-${p._id}`;
            statementRows.push({
                id: `pmt-${p._id}`,
                date: new Date(p.paymentDate || p.createdAt),
                type: 'payment',
                transactionLabel: 'Vendor Payment',
                ref: pmtRef,
                details: `Disbursed via ${p.paymentMethod || 'Bank Transfer'}${p.referenceNumber ? ` (Ref: ${p.referenceNumber})` : ''}`,
                billed: 0,
                paid: p.amount || 0
            });
        });

        if (statementRows.length === 0) {
            // Check for backend ledger entries as fallback
            const searchRegex = new RegExp(supplier.name, 'i');
            const ledgerEntries = await LedgerEntry.find({
                $or: [
                    { contact: id },
                    { supplier: id },
                    { description: searchRegex }
                ]
            }).lean();

            ledgerEntries.forEach(bl => {
                statementRows.push({
                    id: String(bl._id),
                    date: new Date(bl.entryDate || bl.createdAt),
                    type: 'ledger',
                    transactionLabel: bl.type === 'CREDIT' ? 'Ledger Billed' : 'Ledger Paid',
                    ref: bl.transactionId || bl.voucher?.voucherNumber || 'GL-ENTRY',
                    details: bl.description || 'System Journal Entry',
                    billed: bl.type === 'CREDIT' ? (bl.amount || 0) : 0,
                    paid: bl.type === 'DEBIT' ? (bl.amount || 0) : 0
                });
            });
        }

        // Calculate cumulative running AP balance ascending (oldest first)
        statementRows.sort((a, b) => a.date.getTime() - b.date.getTime());
        let runningBal = 0;
        statementRows.forEach(r => {
            runningBal = runningBal + r.billed - r.paid;
            r.balance = runningBal;
        });

        // Sort descending (LATEST AT TOP) for display
        statementRows.sort((a, b) => b.date.getTime() - a.date.getTime());

        res.setHeader("Content-Type", "application/pdf");
        res.setHeader(
            "Content-Disposition",
            `inline; filename="Supplier_General_Ledger_${supplier.name?.replace(/\s+/g, '_') || req.params.id}.pdf"`
        );

        SupplierPdfService.generateSupplierPdf(supplier, statementRows, res);
    } catch (error) {
        console.error("[SupplierController] Error generating supplier PDF:", error);
        const statusCode = error.statusCode || 500;
        return res.status(statusCode).json({ success: false, message: error.message });
    }
};

const bulkAddSuppliers = async (req, res) => {
    try {
        const { suppliers } = req.body;

        if (!Array.isArray(suppliers) || suppliers.length === 0) {
            return res.status(400).json({ success: false, message: "Request body must contain a non-empty 'suppliers' array." });
        }

        if (suppliers.length > 500) {
            return res.status(400).json({ success: false, message: "Maximum 500 suppliers per bulk upload." });
        }

        const userId = req.user.id;
        const userRole = req.user.role;

        const results = await SupplierService.bulkCreate(suppliers, userId, userRole);

        const statusCode = results.created.length > 0 ? 201 : 400;
        return res.status(statusCode).json({
            success: results.created.length > 0,
            message: `${results.created.length} supplier(s) created, ${results.errors.length} error(s).`,
            data: results,
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = {
    addSupplier,
    getSuppliers,
    getSupplierById,
    updateSupplier,
    deleteSupplier,
    downloadSupplierPdf,
    bulkAddSuppliers,
};
