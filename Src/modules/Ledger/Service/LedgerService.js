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
            const pmtRec = await PaymentReceived.findById(paymentTransaction.referenceId)
                .populate('driverId')
                .populate('customerId');
            if (pmtRec) {
                const driverName = pmtRec.driverId ? (pmtRec.driverId.personalInfo?.fullName || pmtRec.driverId.name) : "Unknown Driver";
                const customerName = pmtRec.customerId ? pmtRec.customerId.name : (pmtRec.driverId ? pmtRec.driverId.name : "Unknown Customer");
                const finalBranch = pmtRec.branch || (pmtRec.driverId ? pmtRec.driverId.branch : undefined) || (pmtRec.customerId ? pmtRec.customerId.branch : undefined) || branchId;
                
                // Normalize creatorRole to uppercase if available
                let finalCreatorRole = paymentTransaction.creatorRole ? paymentTransaction.creatorRole.toUpperCase() : "ADMIN";
                const { ROLES } = require("../../../shared/constants/roles");
                if (!Object.values(ROLES).includes(finalCreatorRole)) {
                    finalCreatorRole = "ADMIN";
                }

                // Find Accounts Receivable (AR) and Advance Received accounts
                const AccountingCode = require("../../AccountingCode/Model/AccountingCodeModel");
                const arAccount = await AccountingCode.findOne({ code: "1.1.03" })
                    || await AccountingCode.findOne({ code: "1100" })
                    || await AccountingCode.findOne({ code: "1200" });
                
                const advanceAccount = await AccountingCode.findOne({ code: "2.1.02" })
                    || await AccountingCode.findOne({ name: /Advance Received From Customer/i });

                if (arAccount && advanceAccount) {
                    console.log(`[LedgerService] Generating double-entry for Payment Received: Debit Bank/Cash, Credit Accounts Receivable and/or Advance Received`);
                    
                    const totalAmount = paymentTransaction.totalAmount;
                    const invoices = pmtRec.invoices || [];
                    const totalApplied = invoices.reduce((sum, inv) => sum + (inv.amountApplied || 0), 0);
                    const excessAmount = Math.max(0, totalAmount - totalApplied);
                    const appliedAmount = Math.min(totalAmount, totalApplied);

                    // Leg 1: DEBIT Bank/Cash Account (Asset increases)
                    await addLedgerEntryService({
                        transaction: paymentTransaction._id,
                        branch: finalBranch,
                        accountingCode: paymentTransaction.accountingCode._id || paymentTransaction.accountingCode,
                        type: "DEBIT",
                        amount: totalAmount,
                        description: `Payment Received (Debit Bank/Cash) - Deposited to ${paymentTransaction.accountingCode.name || "selected account"} (PR: ${pmtRec.paymentNumber}). Notes: ${paymentTransaction.notes || "None"}.`,
                        entryDate: paymentTransaction.paymentDate || new Date(),
                        createdBy: paymentTransaction.createdBy,
                        creatorRole: finalCreatorRole
                    });

                    // Leg 2: CREDIT Accounts Receivable (Asset decreases)
                    if (appliedAmount > 0) {
                        await addLedgerEntryService({
                            transaction: paymentTransaction._id,
                            branch: finalBranch,
                            accountingCode: arAccount._id,
                            type: "CREDIT",
                            amount: appliedAmount,
                            description: `Payment Received (Credit Accounts Receivable) - Customer: ${customerName} (PR: ${pmtRec.paymentNumber}). Notes: ${paymentTransaction.notes || "None"}.`,
                            entryDate: paymentTransaction.paymentDate || new Date(),
                            createdBy: paymentTransaction.createdBy,
                            creatorRole: finalCreatorRole
                        });
                    }

                    // Leg 3: CREDIT Advance Received From Customer (Liability increases)
                    if (excessAmount > 0) {
                        await addLedgerEntryService({
                            transaction: paymentTransaction._id,
                            branch: finalBranch,
                            accountingCode: advanceAccount._id,
                            type: "CREDIT",
                            amount: excessAmount,
                            description: `Payment Received (Credit Advance Received From Customer) - Customer: ${customerName} (PR: ${pmtRec.paymentNumber}). Notes: ${paymentTransaction.notes || "None"}.`,
                            entryDate: paymentTransaction.paymentDate || new Date(),
                            createdBy: paymentTransaction.createdBy,
                            creatorRole: finalCreatorRole
                        });
                    }
                    
                    console.log(`[LedgerService] Standalone Payment Received double-entry posted successfully.`);
                    return; // Return early since we fully logged all legs!
                } else {
                    console.error("[LedgerService] Accounts Receivable or Advance Received account not found. Falling back to default single entry.");
                    description = `Payment Received from ${customerName} (PR: ${pmtRec.paymentNumber})${accSuffix}. Notes: ${paymentTransaction.notes || "None"}.`;
                    branchId = finalBranch;
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
 * Debit Accounts Receivable (1.1.03), Credit Rental Income (Sales) (IN0002 or IN0010), Credit Tax Payable (2.1.04).
 */
exports.generateInvoiceLedgerEntries = async (invoice) => {
    try {
        console.log(`[LedgerService] Generating ledger entries for created invoice: ${invoice.invoiceNumber}`);
        
        const LedgerEntry = require("../Model/LedgerEntryModel");
        const AccountingCode = require("../../AccountingCode/Model/AccountingCodeModel");
        const Customer = require("../../Customer/Model/CustomerModel");
        const { Driver } = require("../../Driver/Model/DriverModel");
        const mongoose = require("mongoose");

        // Prevent double booking/duplicate ledger entries for the same invoice
        const existingEntries = await LedgerEntry.find({
            description: new RegExp(`\\(INV:\\s*${invoice.invoiceNumber}\\)`)
        });
        if (existingEntries.length > 0) {
            console.log(`[LedgerService] Ledger entries for invoice ${invoice.invoiceNumber} already exist (${existingEntries.length} found). Skipping duplication.`);
            return;
        }

        // 1. Fetch Accounts Receivable (AR) Account
        const arAccount = await AccountingCode.findOne({ code: "1.1.03" })
            || await AccountingCode.findOne({ code: "1100" })
            || await AccountingCode.findOne({ code: "1200" });

        if (!arAccount) {
            console.error(`[LedgerService] Required Accounts Receivable account not found. Skipping invoice ledger generation.`);
            return;
        }

        // 2. Fetch Customer and Driver details to determine if linked
        const customerDoc = await Customer.findById(invoice.customer);
        const driverDoc = invoice.driver ? await Driver.findById(invoice.driver) : null;

        const isLinkedToDriver = !!driverDoc && invoice.invoiceType !== "MANUAL";
        const customerName = customerDoc ? customerDoc.name : (driverDoc ? driverDoc.name : "Unknown Customer");
        const branchId = invoice.branch || (customerDoc ? customerDoc.branch : undefined) || (driverDoc ? driverDoc.branch : undefined);

        // 3. Determine Income/Revenue Account
        let salesAccount;
        if (isLinkedToDriver) {
            // Rental Income (IN0002) or fallback to 4100
            salesAccount = await AccountingCode.findOne({ code: "IN0002" }) || await AccountingCode.findOne({ code: "4100" });
        } else {
            // Sales (IN0010) or fallback to sales by name/any sales code
            salesAccount = await AccountingCode.findOne({ code: "IN0010" }) 
                || await AccountingCode.findOne({ name: /sales/i })
                || await AccountingCode.findOne({ code: "4100" });
        }

        if (!salesAccount) {
            console.error(`[LedgerService] Required sales/revenue account not found. Skipping invoice ledger generation.`);
            return;
        }

        // 4. Determine Tax Account if tax is present
        const taxAmount = invoice.taxAmount || 0;
        let taxAccount = null;
        if (taxAmount > 0) {
            let taxName = "Tax Payable";
            if (invoice.tax) {
                try {
                    const Tax = mongoose.model("Tax");
                    const taxDoc = await Tax.findById(invoice.tax);
                    if (taxDoc) {
                        taxName = taxDoc.name;
                    }
                } catch (err) {
                    console.error("[LedgerService] Failed to fetch tax doc for ledger routing:", err);
                }
            }

            taxAccount = await AccountingCode.findOne({ name: new RegExp(taxName, "i") })
                || await AccountingCode.findOne({ code: "2.1.04" })
                || await AccountingCode.findOne({ name: /Tax Payable/i })
                || await AccountingCode.findOne({ name: /Output Tax/i })
                || await AccountingCode.findOne({ code: "TAX0002" });
        }

        const baseAmount = taxAmount > 0 ? (invoice.baseAmount || (invoice.totalAmountDue - taxAmount)) : invoice.totalAmountDue;

        // Leg 1: DEBIT Accounts Receivable (increases Accounts Receivable Asset)
        await addLedgerEntryService({
            branch: branchId,
            accountingCode: arAccount._id,
            type: "DEBIT",
            amount: invoice.totalAmountDue,
            description: `Invoice Created (Debit Accounts Receivable) - Customer: ${customerName} (INV: ${invoice.invoiceNumber}).`,
            entryDate: invoice.generatedAt || invoice.createdAt || new Date(),
            createdBy: invoice.createdBy,
            creatorRole: invoice.creatorRole
        });

        // Determine credited accounts for line items or general
        if (invoice.invoiceType === "MANUAL" && invoice.lineItems && invoice.lineItems.length > 0) {
            const InventoryPart = mongoose.model("InventoryPart");
            const subtotal = invoice.subtotal || invoice.totalAmountDue;
            const factor = subtotal > 0 ? (baseAmount / subtotal) : 1;

            let allocatedBase = 0;
            for (let i = 0; i < invoice.lineItems.length; i++) {
                const item = invoice.lineItems[i];
                let itemBaseAmount = Math.round(item.total * factor * 100) / 100;
                if (i === invoice.lineItems.length - 1) {
                    itemBaseAmount = Math.round((baseAmount - allocatedBase) * 100) / 100;
                }
                allocatedBase += itemBaseAmount;

                // Determine revenue account for this item
                let itemSalesAccount = salesAccount;
                if (item.inventoryPart) {
                    const partDoc = await InventoryPart.findById(item.inventoryPart);
                    if (partDoc && partDoc.salesAccount) {
                        const customAccount = await AccountingCode.findById(partDoc.salesAccount);
                        if (customAccount) {
                            itemSalesAccount = customAccount;
                        }
                    }
                }

                // Leg 2: CREDIT Sales / Rental Income for this line item (increases Revenue)
                if (itemBaseAmount > 0) {
                    await addLedgerEntryService({
                        branch: branchId,
                        accountingCode: itemSalesAccount._id,
                        type: "CREDIT",
                        amount: itemBaseAmount,
                        description: `Invoice Created (Credit ${itemSalesAccount.code === "IN0002" ? 'Rental Income' : 'Sales'}) [Item: ${item.name}] - Customer: ${customerName} (INV: ${invoice.invoiceNumber}).`,
                        entryDate: invoice.generatedAt || invoice.createdAt || new Date(),
                        createdBy: invoice.createdBy,
                        creatorRole: invoice.creatorRole
                    });
                }
            }
        } else {
            // General fallback (Leg 2: CREDIT Rental Income (Sales) or Sales (increases Revenue))
            await addLedgerEntryService({
                branch: branchId,
                accountingCode: salesAccount._id,
                type: "CREDIT",
                amount: baseAmount,
                description: `Invoice Created (Credit ${isLinkedToDriver ? 'Rental Income' : 'Sales'}) - Customer: ${customerName} (INV: ${invoice.invoiceNumber}).`,
                entryDate: invoice.generatedAt || invoice.createdAt || new Date(),
                createdBy: invoice.createdBy,
                creatorRole: invoice.creatorRole
            });
        }

        // Leg 3: CREDIT Tax Payable (if taxAmount > 0 and taxAccount exists)
        if (taxAmount > 0 && taxAccount) {
            await addLedgerEntryService({
                branch: branchId,
                accountingCode: taxAccount._id,
                type: "CREDIT",
                amount: taxAmount,
                description: `Invoice Created (Credit Tax Payable 7%) - Customer: ${customerName} (INV: ${invoice.invoiceNumber}).`,
                entryDate: invoice.generatedAt || invoice.createdAt || new Date(),
                createdBy: invoice.createdBy,
                creatorRole: invoice.creatorRole
            });
        }

        console.log(`[LedgerService] Successfully created double-entry ledger entries for invoice: ${invoice.invoiceNumber}`);
    } catch (error) {
        console.error("[LedgerService] Failed to generate invoice ledger entries:", error);
    }
};

/**
 * Generates double-entry Ledger Entries when an Advance (prepayment) is applied to an Invoice (rollover).
 * Debit Advance Received From Customer (2.1.02), Credit Accounts Receivable (1.1.03).
 */
exports.generateRolloverLedgerEntry = async ({ customer, invoice, amount, createdBy, creatorRole }) => {
    try {
        console.log(`[LedgerService] Generating rollover ledger entries for customer ${customer} and invoice ${invoice.invoiceNumber}`);
        
        const AccountingCode = require("../../AccountingCode/Model/AccountingCodeModel");
        const Customer = require("../../Customer/Model/CustomerModel");

        // Find Accounts Receivable (AR) Account
        const arAccount = await AccountingCode.findOne({ code: "1.1.03" })
            || await AccountingCode.findOne({ code: "1100" })
            || await AccountingCode.findOne({ code: "1200" });

        // Find Advance Received From Customer Account
        const advanceAccount = await AccountingCode.findOne({ code: "2.1.02" })
            || await AccountingCode.findOne({ name: /Advance Received From Customer/i });

        if (!arAccount || !advanceAccount) {
            console.error(`[LedgerService] Required accounting codes for rollover (AR/Advance) not found. Skipping rollover ledger entry.`);
            return;
        }

        const customerDoc = await Customer.findById(customer);
        const branchId = invoice.branch || (customerDoc ? customerDoc.branch : undefined);
        const customerName = customerDoc ? customerDoc.name : "Unknown Customer";

        // Leg 1: DEBIT Advance Received From Customer (reduces Advance liability)
        await addLedgerEntryService({
            branch: branchId,
            accountingCode: advanceAccount._id,
            type: "DEBIT",
            amount: amount,
            description: `Advance Applied (Debit Advance Received From Customer) - Customer: ${customerName} (INV: ${invoice.invoiceNumber}).`,
            entryDate: new Date(),
            createdBy,
            creatorRole
        });

        // Leg 2: CREDIT Accounts Receivable (reduces Accounts Receivable Asset)
        await addLedgerEntryService({
            branch: branchId,
            accountingCode: arAccount._id,
            type: "CREDIT",
            amount: amount,
            description: `Advance Applied (Credit Accounts Receivable) - Customer: ${customerName} (INV: ${invoice.invoiceNumber}).`,
            entryDate: new Date(),
            createdBy,
            creatorRole
        });

        console.log(`[LedgerService] Successfully created double-entry rollover ledger entries for invoice: ${invoice.invoiceNumber}`);
    } catch (error) {
        console.error("[LedgerService] Failed to generate rollover ledger entries:", error);
    }
};

