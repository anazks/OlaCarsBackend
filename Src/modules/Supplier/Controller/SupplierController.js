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
const LedgerEntry = require("../../Ledger/Model/LedgerEntryModel");

const downloadSupplierPdf = async (req, res) => {
    try {
        const supplier = await SupplierService.getById(req.params.id);
        if (!supplier) {
            return res.status(404).json({ success: false, message: "Supplier not found" });
        }

        const id = supplier._id;
        const supNameLower = (supplier.name || '').toLowerCase();
        const supVendorNumLower = (supplier.vendorNumber || '').toLowerCase();

        // 1. Fetch Payments Made for this supplier
        const payments = await PaymentMade.find({ supplier: id }).lean();

        // 2. Fetch Ledger Entries matching vendor name/contact
        const searchRegex = new RegExp(supplier.name, 'i');
        const ledgerEntries = await LedgerEntry.find({
            $or: [
                { contact: id },
                { supplier: id },
                { description: searchRegex },
                { transactionId: searchRegex }
            ]
        })
        .populate("accountingCode", "code name category")
        .populate("transaction")
        .populate("voucher")
        .lean();

        // 3. Identify vendor bank transactions & collect connected double-entry IDs
        const vendorBankTransactionIds = new Set();
        const vendorBankVouchers = new Set();
        const directBankEntryIds = new Set();

        ledgerEntries.forEach((l) => {
            if (!l || !l._id) return;
            const desc = (l.description || '').toLowerCase();
            const contactName = (typeof l.contact === 'string' ? l.contact : (l.contact?.name || (l.contact ? String(l.contact) : ''))).toLowerCase();
            const txId = (l.transactionId || '').toLowerCase();
            const accCat = (l.accountingCode?.category || '').toUpperCase();
            const accCodeStr = (l.accountingCode?.code || '').toLowerCase();
            const accNameStr = (l.accountingCode?.name || '').toLowerCase();

            const isVendorMatch = (
                (supNameLower && (desc.includes(supNameLower) || contactName.includes(supNameLower) || txId.includes(supNameLower))) ||
                (supVendorNumLower && (desc.includes(supVendorNumLower) || txId.includes(supVendorNumLower))) ||
                (l.contact && (String(l.contact) === String(id) || String(l.contact?._id) === String(id))) ||
                (l.supplier && (String(l.supplier) === String(id) || String(l.supplier?._id) === String(id)))
            );

            const isBankTx = (
                l.transaction ||
                l.bankTxType ||
                accCat === 'ASSET' ||
                accCodeStr.startsWith('1.1') ||
                accNameStr.includes('bank') ||
                accNameStr.includes('cash') ||
                desc.includes('payment') ||
                desc.includes('pmt') ||
                desc.includes('bank') ||
                desc.includes('transfer')
            );

            if (isVendorMatch && isBankTx) {
                directBankEntryIds.add(String(l._id));
                if (l.transactionId) vendorBankTransactionIds.add(l.transactionId);
                if (l.transaction?._id) vendorBankTransactionIds.add(String(l.transaction._id));
                if (l.voucher?._id) vendorBankVouchers.add(String(l.voucher._id));
            }
        });

        // 4. Gather all connected double-entry legs
        const entriesMap = new Map();
        ledgerEntries.forEach((l) => {
            if (!l || !l._id) return;
            const tId = l.transactionId;
            const txObjId = l.transaction?._id ? String(l.transaction._id) : null;
            const vId = l.voucher?._id ? String(l.voucher._id) : null;

            const isConnectedDoubleEntry = (
                directBankEntryIds.has(String(l._id)) ||
                (tId && vendorBankTransactionIds.has(tId)) ||
                (txObjId && vendorBankTransactionIds.has(txObjId)) ||
                (vId && vendorBankVouchers.has(vId))
            );

            if (isConnectedDoubleEntry) {
                entriesMap.set(String(l._id), l);
            }
        });

        const backendBankLedgerEntries = Array.from(entriesMap.values());

        // 5. Combine with payments made
        const combinedEntries = [];

        payments.forEach(p => {
            const pmtRef = p.paymentNumber || p.paymentCode || p.referenceNumber || `PMT-${p._id}`;
            const hasBackendCoverage = backendBankLedgerEntries.some(bl => 
                (bl.transactionId && (bl.transactionId === pmtRef || bl.transactionId === p.paymentCode || bl.transactionId === p.referenceNumber))
            );

            if (!hasBackendCoverage) {
                combinedEntries.push({
                    id: `pmt-deb-${p._id}`,
                    ref: pmtRef,
                    date: new Date(p.paymentDate || p.createdAt),
                    account: '2.1.01 Accounts Payable',
                    type: 'DEBIT',
                    description: `Bank Payment Disbursed (${p.paymentMethod || 'Bank Transfer'}) ${p.referenceNumber ? `Ref: ${p.referenceNumber}` : ''}`,
                    debit: p.amount || 0,
                    credit: 0
                });

                combinedEntries.push({
                    id: `pmt-cred-${p._id}`,
                    ref: pmtRef,
                    date: new Date(p.paymentDate || p.createdAt),
                    account: '1.1.02 Bank Account',
                    type: 'CREDIT',
                    description: `Bank Disbursed Output (${p.paymentMethod || 'Bank Transfer'})`,
                    debit: 0,
                    credit: p.amount || 0
                });
            }
        });

        backendBankLedgerEntries.forEach(bl => {
            const accCode = bl.accountingCode 
                ? `${bl.accountingCode.code || ''} ${bl.accountingCode.name || ''}` 
                : (bl.type === 'CREDIT' ? '1.1.02 Bank Account' : '2.1.01 Accounts Payable');

            combinedEntries.push({
                id: String(bl._id),
                ref: bl.transactionId || bl.voucher?.voucherNumber || 'BANK-TX',
                date: new Date(bl.entryDate || bl.createdAt),
                account: accCode,
                type: bl.type || 'DEBIT',
                description: bl.description || 'Vendor Bank Transaction Entry',
                debit: bl.type === 'DEBIT' ? (bl.amount || 0) : 0,
                credit: bl.type === 'CREDIT' ? (bl.amount || 0) : 0
            });
        });

        // 6. Calculate cumulative running balance ascending (oldest first)
        combinedEntries.sort((a, b) => a.date.getTime() - b.date.getTime());
        let cumBalance = 0;
        combinedEntries.forEach(ent => {
            cumBalance = cumBalance + ent.credit - ent.debit;
            ent.runningBalance = cumBalance;
        });

        // 7. Sort in reverse chronological order (LATEST AT TOP) for display
        combinedEntries.sort((a, b) => b.date.getTime() - a.date.getTime());

        res.setHeader("Content-Type", "application/pdf");
        res.setHeader(
            "Content-Disposition",
            `inline; filename="Supplier_Bank_Ledger_${supplier.name?.replace(/\s+/g, '_') || req.params.id}.pdf"`
        );

        SupplierPdfService.generateSupplierPdf(supplier, combinedEntries, res);
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
