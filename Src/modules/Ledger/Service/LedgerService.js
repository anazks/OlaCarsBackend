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
    'voucher',
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
        
        // Enrich description if this is a Purchase Order or Bill payment
        if (paymentTransaction.referenceModel === "PurchaseOrder") {
            const PurchaseOrder = require('../../PurchaseOrder/Model/PurchaseOrderModel');
            const po = await PurchaseOrder.findById(paymentTransaction.referenceId).populate('supplier');
            if (po) {
                const supplierName = po.supplier ? po.supplier.name : "Unknown Supplier";
                description = `Purchase Order Payment to ${supplierName} for ${po.purpose} (PO: ${po.purchaseOrderNumber})${accSuffix}. Notes: ${paymentTransaction.notes || "None"}.`;
                branchId = po.branch;
            }
        } else if (paymentTransaction.referenceModel === "Bill") {
            const Bill = require('../../Bill/Model/BillModel');
            const bill = await Bill.findById(paymentTransaction.referenceId).populate('supplier');
            if (bill) {
                const supplierName = bill.supplier ? bill.supplier.name : "Unknown Supplier";
                
                // 1. Find Accounts Payable account (code 2100)
                const AccountingCode = require("../../AccountingCode/Model/AccountingCodeModel");
                const apAccount = await AccountingCode.findOne({ code: "2100", category: "LIABILITY" });
                
                if (apAccount) {
                    console.log(`[LedgerService] Generating double-entry for Bill Payment: Debit Accounts Payable, Credit Bank/Cash`);
                    
                    // Leg 1: DEBIT Accounts Payable (Liability decreases)
                    await addLedgerEntryService({
                        transaction: paymentTransaction._id,
                        branch: bill.branch || branchId,
                        accountingCode: apAccount._id,
                        type: "DEBIT",
                        amount: paymentTransaction.totalAmount,
                        description: `Bill Payment (Debit Accounts Payable) to ${supplierName} (Bill: ${bill.billNumber}). Notes: ${paymentTransaction.notes || "None"}.`,
                        entryDate: paymentTransaction.paymentDate || new Date(),
                        createdBy: paymentTransaction.createdBy,
                        creatorRole: paymentTransaction.creatorRole
                    });

                    // Leg 2: CREDIT Bank/Cash Account (Asset decreases)
                    await addLedgerEntryService({
                        transaction: paymentTransaction._id,
                        branch: bill.branch || branchId,
                        accountingCode: paymentTransaction.accountingCode._id || paymentTransaction.accountingCode,
                        type: "CREDIT",
                        amount: paymentTransaction.totalAmount,
                        description: `Bill Payment (Credit Bank/Cash) - Taken from ${paymentTransaction.accountingCode.name || "selected account"} (Bill: ${bill.billNumber}). Notes: ${paymentTransaction.notes || "None"}.`,
                        entryDate: paymentTransaction.paymentDate || new Date(),
                        createdBy: paymentTransaction.createdBy,
                        creatorRole: paymentTransaction.creatorRole
                    });
                    
                    console.log(`[LedgerService] Standalone Bill Payment double-entry posted successfully.`);
                    return; // Return early since we fully logged both legs!
                } else {
                    console.error("[LedgerService] Accounts Payable account (2100) not found. Falling back to default single entry.");
                    description = `Bill Payment to ${supplierName} (Bill: ${bill.billNumber})${accSuffix}. Notes: ${paymentTransaction.notes || "None"}.`;
                    branchId = bill.branch;
                }
            }
        } else if (paymentTransaction.referenceModel === "PaymentMade") {
            const PaymentMade = require('../../PaymentMade/Model/PaymentMadeModel');
            const pmtMade = await PaymentMade.findById(paymentTransaction.referenceId).populate('supplier');
            if (pmtMade) {
                const supplierName = pmtMade.supplier ? pmtMade.supplier.name : "Unknown Supplier";
                
                // 1. Find Accounts Payable account (code 2100)
                const AccountingCode = require("../../AccountingCode/Model/AccountingCodeModel");
                const apAccount = await AccountingCode.findOne({ code: "2100", category: "LIABILITY" });
                
                if (apAccount) {
                    console.log(`[LedgerService] Generating double-entry for Payment Made: Debit Accounts Payable, Credit Bank/Cash`);
                    
                    // Leg 1: DEBIT Accounts Payable (Liability decreases/Prepayment increases)
                    await addLedgerEntryService({
                        transaction: paymentTransaction._id,
                        branch: pmtMade.branch || branchId,
                        accountingCode: apAccount._id,
                        type: "DEBIT",
                        amount: paymentTransaction.totalAmount,
                        description: `Payment Made to Vendor (Debit Accounts Payable) - ${supplierName} (PMT: ${pmtMade.paymentNumber}). Notes: ${paymentTransaction.notes || "None"}.`,
                        entryDate: paymentTransaction.paymentDate || new Date(),
                        createdBy: paymentTransaction.createdBy,
                        creatorRole: paymentTransaction.creatorRole
                    });

                    // Leg 2: CREDIT Bank/Cash Account (Asset decreases)
                    await addLedgerEntryService({
                        transaction: paymentTransaction._id,
                        branch: pmtMade.branch || branchId,
                        accountingCode: paymentTransaction.accountingCode._id || paymentTransaction.accountingCode,
                        type: "CREDIT",
                        amount: paymentTransaction.totalAmount,
                        description: `Payment Made to Vendor (Credit Bank/Cash) - Taken from ${paymentTransaction.accountingCode.name || "selected account"} (PMT: ${pmtMade.paymentNumber}). Notes: ${paymentTransaction.notes || "None"}.`,
                        entryDate: paymentTransaction.paymentDate || new Date(),
                        createdBy: paymentTransaction.createdBy,
                        creatorRole: paymentTransaction.creatorRole
                    });
                    
                    console.log(`[LedgerService] Standalone Payment Made double-entry posted successfully.`);
                    return; // Return early since we fully logged both legs!
                } else {
                    console.error("[LedgerService] Accounts Payable account (2100) not found. Falling back to default single entry.");
                    description = `Payment Made to ${supplierName} (PMT: ${pmtMade.paymentNumber})${accSuffix}. Notes: ${paymentTransaction.notes || "None"}.`;
                    branchId = pmtMade.branch;
                }
            }
        } else if (paymentTransaction.referenceModel === "PaymentReceived") {
            const PaymentReceived = require('../../PaymentReceived/Model/PaymentReceivedModel');
            const pmtRec = await PaymentReceived.findById(paymentTransaction.referenceId).populate('driverId');
            if (pmtRec) {
                const driverName = pmtRec.driverId ? (pmtRec.driverId.personalInfo?.fullName || pmtRec.driverId.name) : "Unknown Driver";
                const finalBranch = pmtRec.branch || (pmtRec.driverId ? pmtRec.driverId.branch : undefined) || branchId;
                
                // Normalize creatorRole to uppercase if available
                let finalCreatorRole = paymentTransaction.creatorRole ? paymentTransaction.creatorRole.toUpperCase() : "ADMIN";
                const { ROLES } = require("../../../shared/constants/roles");
                if (!Object.values(ROLES).includes(finalCreatorRole)) {
                    finalCreatorRole = "ADMIN";
                }

                // Find Accounts Receivable account (code 1200)
                const AccountingCode = require("../../AccountingCode/Model/AccountingCodeModel");
                const arAccount = await AccountingCode.findOne({ code: "1200" });
                
                if (arAccount) {
                    console.log(`[LedgerService] Generating double-entry for Payment Received: Credit Bank/Cash, Debit Accounts Receivable`);
                    
                    // Leg 1: CREDIT Bank/Cash Account
                    await addLedgerEntryService({
                        transaction: paymentTransaction._id,
                        branch: finalBranch,
                        accountingCode: paymentTransaction.accountingCode._id || paymentTransaction.accountingCode,
                        type: "CREDIT",
                        amount: paymentTransaction.totalAmount,
                        description: `Payment Received (Credit Bank/Cash) - Deposited to ${paymentTransaction.accountingCode.name || "selected account"} (PR: ${pmtRec.paymentNumber}). Notes: ${paymentTransaction.notes || "None"}.`,
                        entryDate: paymentTransaction.paymentDate || new Date(),
                        createdBy: paymentTransaction.createdBy,
                        creatorRole: finalCreatorRole
                    });

                    // Leg 2: DEBIT Accounts Receivable
                    await addLedgerEntryService({
                        transaction: paymentTransaction._id,
                        branch: finalBranch,
                        accountingCode: arAccount._id,
                        type: "DEBIT",
                        amount: paymentTransaction.totalAmount,
                        description: `Payment Received (Debit Accounts Receivable) - Driver: ${driverName} (PR: ${pmtRec.paymentNumber}). Notes: ${paymentTransaction.notes || "None"}.`,
                        entryDate: paymentTransaction.paymentDate || new Date(),
                        createdBy: paymentTransaction.createdBy,
                        creatorRole: finalCreatorRole
                    });
                    
                    console.log(`[LedgerService] Standalone Payment Received double-entry posted successfully.`);
                    return; // Return early since we fully logged both legs!
                } else {
                    console.error("[LedgerService] Accounts Receivable account (1200) not found. Falling back to default single entry.");
                    description = `Payment Received from ${driverName} (PR: ${pmtRec.paymentNumber})${accSuffix}. Notes: ${paymentTransaction.notes || "None"}.`;
                    branchId = pmtRec.branch;
                }
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

/**
 * Automatically generates double-entry Ledger Entries when an Invoice is created.
 * Debit Accounts Receivable (1200), Credit Rental Income (Sales) (4100).
 */
exports.generateInvoiceLedgerEntries = async (invoice) => {
    try {
        console.log(`[LedgerService] Generating ledger entries for created invoice: ${invoice.invoiceNumber}`);
        
        const AccountingCode = require("../../AccountingCode/Model/AccountingCodeModel");
        const { Driver } = require("../../Driver/Model/DriverModel");

        const arAccount = await AccountingCode.findOne({ code: "1200" });
        const salesAccount = await AccountingCode.findOne({ code: "4100" });

        if (!arAccount || !salesAccount) {
            console.error(`[LedgerService] Required accounting codes (1200 or 4100) not found. Skipping invoice ledger generation.`);
            return;
        }

        const driverDoc = await Driver.findById(invoice.driver);
        const driverName = driverDoc ? (driverDoc.personalInfo?.fullName || driverDoc.name) : "Unknown Driver";
        const branchId = invoice.branch || (driverDoc ? driverDoc.branch : undefined);

        // Leg 1: CREDIT Accounts Receivable (decreases/increases according to user's mapping)
        await addLedgerEntryService({
            branch: branchId,
            accountingCode: arAccount._id,
            type: "CREDIT",
            amount: invoice.baseAmount,
            description: `Invoice Created (Credit Accounts Receivable) - Driver: ${driverName} (INV: ${invoice.invoiceNumber}).`,
            entryDate: invoice.generatedAt || invoice.createdAt || new Date(),
            createdBy: invoice.createdBy,
            creatorRole: invoice.creatorRole
        });

        // Leg 2: DEBIT Rental Income (Sales) (decreases/increases according to user's mapping)
        await addLedgerEntryService({
            branch: branchId,
            accountingCode: salesAccount._id,
            type: "DEBIT",
            amount: invoice.baseAmount,
            description: `Invoice Created (Debit Rental Income) - Driver: ${driverName} (INV: ${invoice.invoiceNumber}).`,
            entryDate: invoice.generatedAt || invoice.createdAt || new Date(),
            createdBy: invoice.createdBy,
            creatorRole: invoice.creatorRole
        });

        console.log(`[LedgerService] Successfully created double-entry ledger entries for invoice: ${invoice.invoiceNumber}`);
    } catch (error) {
        console.error("[LedgerService] Failed to generate invoice ledger entries:", error);
    }
};

