const { addLedgerEntryService, getLedgerEntriesService } = require("../Repo/LedgerRepo");
const filterBody = require('../../../shared/utils/filterBody.js');

const ALLOWED_CREATE_FIELDS = [
    'transaction', 
    'manualJournal',
    'branch',
    'accountingCode', 
    'type', 
    'amount', 
    'description', 
    'entryDate',
    'taxInfo',
    'createdBy',
    'creatorRole'
];

/**
 * Creates a ledger entry with field whitelisting.
 */
exports.create = async (data) => {
    const filtered = filterBody(data, ...ALLOWED_CREATE_FIELDS);
    return await addLedgerEntryService(filtered);
};

/**
 * Retrieves all ledger entries.
 */
exports.getAll = async (query = {}) => {
    return await getLedgerEntriesService(query);
};

/**
 * Automatically generates a Ledger Entry from a completed PaymentTransaction.
 * This ensures immutable double-entry style tracking.
 */
exports.autoGenerateLedgerEntry = async (paymentTransaction) => {
    try {
        // Check if an entry already exists for this transaction to prevent duplicates
        const existing = await getLedgerEntriesService({ transaction: paymentTransaction._id });
        if (existing && existing.length > 0) {
            console.log(`[LedgerService] Entry already exists for transaction ${paymentTransaction._id}, skipping.`);
            return;
        }

        // Construct standard description showing context
        const accSuffix = paymentTransaction.accountingCode && paymentTransaction.accountingCode.name 
            ? ` [${paymentTransaction.accountingCode.name}]` 
            : "";
        
        let description = `Payment [${paymentTransaction.transactionType}] for ${paymentTransaction.referenceModel}${accSuffix}. Ref ID: ${paymentTransaction.referenceId}. Notes: ${paymentTransaction.notes || "None"}.`;

        // Resolve branch from reference model
        let branchId = paymentTransaction.branch; // Try direct first
        
        // Enrich description if this is a Purchase Order payment
        if (paymentTransaction.referenceModel === "PurchaseOrder") {
            const PurchaseOrder = require('../../PurchaseOrder/Model/PurchaseOrderModel');
            const po = await PurchaseOrder.findById(paymentTransaction.referenceId).populate('supplier');
            if (po) {
                const supplierName = po.supplier ? po.supplier.name : "Unknown Supplier";
                description = `Purchase Order Payment to ${supplierName} for ${po.purpose} (PO: ${po.purchaseOrderNumber})${accSuffix}. Notes: ${paymentTransaction.notes || "None"}.`;
                branchId = po.branch;
            }
        }

        const ledgerData = {
            transaction: paymentTransaction._id,
            branch: branchId, // Critical for reporting
            accountingCode: paymentTransaction.accountingCode._id || paymentTransaction.accountingCode,
            type: paymentTransaction.transactionType, // Mirrors the DEBIT/CREDIT set by the user
            amount: paymentTransaction.totalAmount, // Maps exact amount
            description: description,
            entryDate: paymentTransaction.paymentDate || new Date(),
            taxInfo: {
                taxApplied: paymentTransaction.taxApplied,
                taxAmount: paymentTransaction.taxAmount,
                isTaxInclusive: paymentTransaction.isTaxInclusive
            },
            createdBy: paymentTransaction.createdBy,
            creatorRole: paymentTransaction.creatorRole
        };

        console.log(`[LedgerService] Auto-generating ledger entry for transaction: ${paymentTransaction._id}`);
        await addLedgerEntryService(ledgerData);
        console.log(`[LedgerService] Successfully created ledger entry for transaction: ${paymentTransaction._id}`);

    } catch (error) {
        console.error("[LedgerService] Failed to generate ledger entry:", error);
    }
};
