const { createBill, getBillById, updateBill } = require("../Repo/ServiceBillRepo");
const { getWorkOrderById } = require("../../WorkOrder/Repo/WorkOrderRepo");
const { addPaymentTransactionService } = require("../../Payment/Repo/PaymentTransactionRepo");
const { autoGenerateLedgerEntry } = require("../../Ledger/Service/LedgerService");
const AccountingCode = require("../../AccountingCode/Model/AccountingCodeModel");
const Tax = require("../../Tax/Model/TaxModel");

/**
 * Generate a ServiceBill from a completed Work Order.
 * Pulls parts, labour data and creates line items + totals.
 * @param {string} woId - Work Order ID
 * @param {Object} options - { taxRate, hourlyRate, discount, notes, additionalCharges }
 * @param {Object} user - { id, role }
 * @returns {Promise<Object>}
 */
const generateFromWorkOrder = async (woId, options = {}, user) => {
    const wo = await getWorkOrderById(woId);
    if (!wo) {
        const err = new Error(`Work order not found for ID: ${woId}`);
        err.statusCode = 404;
        throw err;
    }

    // Check WO is in a billable state
    const billableStatuses = ["QUALITY_CHECK", "READY_FOR_RELEASE", "VEHICLE_RELEASED", "INVOICED", "CLOSED"];
    if (!billableStatuses.includes(wo.status)) {
        throw new Error(
            `Work order must be in a billable state (QC onwards) to generate a bill. Current status: ${wo.status}`,
            { cause: 400 }
        );
    }

    const { getSetting } = require("../../SystemSettings/Repo/SystemSettingsRepo");
    const configuredHourlyRate = (await getSetting("hourlyLabourRate")) || 150;
    const hourlyRate = options.hourlyRate !== undefined ? Number(options.hourlyRate) : configuredHourlyRate;
    const discount = options.discount || 0;

    // ─── Tax Profile: Auto-fetch ITBMS from Tax collection if no explicit rate ───
    let taxRate = 0;
    let taxName = "";
    let taxProfileId = null;

    if (options.taxRate !== undefined && options.taxRate !== null) {
        // Explicit tax rate passed from frontend (user override)
        taxRate = Number(options.taxRate);
        taxName = options.taxName || "Custom Tax";
        if (options.taxProfileId) taxProfileId = options.taxProfileId;
    } else {
        // Auto-fetch ITBMS tax profile (default workshop tax)
        try {
            const itbmsTax = await Tax.findOne({
                name: { $regex: /ITBMS/i },
                isActive: true,
                isDeleted: { $ne: true }
            });
            if (itbmsTax) {
                taxRate = itbmsTax.rate;
                taxName = itbmsTax.name;
                taxProfileId = itbmsTax._id;
                console.log(`[ServiceBill] Auto-applied tax profile: ${itbmsTax.name} @ ${itbmsTax.rate}%`);
            } else {
                // Fallback: try any active tax profile
                const anyTax = await Tax.findOne({ isActive: true, isDeleted: { $ne: true } });
                if (anyTax) {
                    taxRate = anyTax.rate;
                    taxName = anyTax.name;
                    taxProfileId = anyTax._id;
                    console.log(`[ServiceBill] Fallback tax profile: ${anyTax.name} @ ${anyTax.rate}%`);
                }
            }
        } catch (err) {
            console.error("[ServiceBill] Failed to fetch tax profile:", err.message);
        }
    }

    // Build line items from parts
    const lineItems = [];

    for (const part of wo.parts || []) {
        if (part.status === "INSTALLED" || part.status === "RECEIVED") {
            lineItems.push({
                type: "PART",
                description: `${part.partName}${part.partNumber ? ` (${part.partNumber})` : ""}`,
                quantity: part.quantity,
                unitPrice: part.unitCost,
                lineTotal: part.totalCost,
                partId: part.inventoryPartId || undefined,
            });
        }
    }

    // Build labour line item
    const actualHours = wo.actualLabourHours || 0;
    if (actualHours > 0) {
        lineItems.push({
            type: "LABOUR",
            description: `Workshop labour — ${actualHours} hours @ $${hourlyRate}/hr`,
            quantity: actualHours,
            unitPrice: hourlyRate,
            lineTotal: actualHours * hourlyRate,
        });
    }

    // Add additional charges if provided
    if (options.additionalCharges && Array.isArray(options.additionalCharges)) {
        options.additionalCharges.forEach(charge => {
            lineItems.push({
                type: "MISC",
                description: charge.description || "Additional Charge",
                quantity: 1,
                unitPrice: charge.amount || 0,
                lineTotal: charge.amount || 0
            });
        });
    }

    // Calculate totals
    const partsTotal = lineItems.filter(i => i.type === "PART").reduce((sum, item) => sum + item.lineTotal, 0);
    const labourTotal = lineItems.filter(i => i.type === "LABOUR").reduce((sum, item) => sum + item.lineTotal, 0);
    const miscTotal = lineItems.filter(i => i.type === "MISC").reduce((sum, item) => sum + item.lineTotal, 0);

    const subtotal = partsTotal + labourTotal + miscTotal;

    // ─── INCLUSIVE Tax Calculation ───
    // Subtotal (parts + labour + misc) already includes the tax
    const totalAmount = subtotal - discount;
    const taxAmount = Math.round((totalAmount - (totalAmount / (1 + taxRate / 100))) * 100) / 100;
    const preTaxTotal = totalAmount - taxAmount;

    // Revenue scale factor to scale down the inclusive prices to pre-tax revenue
    const revenueFactor = subtotal > 0 ? preTaxTotal / subtotal : 0;
    let remainingPreTax = preTaxTotal;

    const arCodeDoc = await AccountingCode.findOne({ code: "1100" }) || await AccountingCode.findOne({ code: "1200" });
    const arCode = arCodeDoc ? arCodeDoc.code : "1100";
    const accountingEntries = [
        {
            entryType: "DEBIT",
            accountCode: arCode, // Accounts Receivable
            accountName: "Accounts Receivable",
            amount: totalAmount,
            description: `Receivable for Workshop Bill ${wo.workOrderNumber}`,
        }
    ];

    if (labourTotal > 0) {
        const amt = Math.round(labourTotal * revenueFactor * 100) / 100;
        remainingPreTax -= amt;
        accountingEntries.push({
            entryType: "CREDIT",
            accountCode: "4030",
            accountName: "Labour Charges Income",
            amount: amt,
            description: `Labour income for WO ${wo.workOrderNumber}`,
        });
    }

    const { InventoryPart } = require("../../Inventory/Model/InventoryPartModel");
    const partIds = lineItems.filter(i => i.type === "PART" && i.partId).map(i => i.partId);

    let partsMap = {};
    if (partIds.length > 0) {
        const parts = await InventoryPart.find({ _id: { $in: partIds } })
            .populate("incomeAccountId")
            .populate("purchaseAccountId")
            .populate("inventoryAccountId");
        for (const p of parts) {
            partsMap[p._id.toString()] = p;
        }
    }

    const fallbackIncome = await AccountingCode.findOne({ code: "4040" }) || { code: "4040", name: "Spare Parts Sales" };
    const fallbackPurchase = await AccountingCode.findOne({ code: "CGS0001" }) || { code: "CGS0001", name: "Cost of Goods Sold" };
    const fallbackInventory = await AccountingCode.findOne({ code: "1300" }) || { code: "1300", name: "Inventory Asset" };

    const salesGroups = {};
    const cogsGroups = {};

    for (const item of lineItems) {
        if (item.type === "PART") {
            const ip = item.partId ? partsMap[item.partId.toString()] : null;

            // Income
            const incCode = ip?.incomeAccountId?.code || fallbackIncome.code;
            const incName = ip?.incomeAccountId?.name || fallbackIncome.name;

            if (!salesGroups[incCode]) {
                salesGroups[incCode] = { accountCode: incCode, accountName: incName, amount: 0 };
            }
            salesGroups[incCode].amount += item.lineTotal;

            // COGS
            const unitCost = ip?.unitCost || 0;
            const costTotal = unitCost * item.quantity;

            if (costTotal > 0) {
                const purCode = ip?.purchaseAccountId?.code || fallbackPurchase.code;
                const purName = ip?.purchaseAccountId?.name || fallbackPurchase.name;
                const invCode = ip?.inventoryAccountId?.code || fallbackInventory.code;
                const invName = ip?.inventoryAccountId?.name || fallbackInventory.name;

                if (!cogsGroups[purCode]) {
                    cogsGroups[purCode] = {
                        accountCode: purCode, accountName: purName,
                        invCode, invName,
                        amount: 0
                    };
                }
                cogsGroups[purCode].amount += costTotal;
            }
        }
    }

    // Add Sales Income entries
    const salesGroupKeys = Object.keys(salesGroups);
    for (const code of salesGroupKeys) {
        const grp = salesGroups[code];
        if (grp.amount > 0) {
            let amt = Math.round(grp.amount * revenueFactor * 100) / 100;
            remainingPreTax -= amt;
            accountingEntries.push({
                entryType: "CREDIT",
                accountCode: grp.accountCode,
                accountName: grp.accountName,
                amount: amt,
                description: `Parts sales for WO ${wo.workOrderNumber}`,
            });
        }
    }

    // Add COGS entries
    for (const code in cogsGroups) {
        const grp = cogsGroups[code];
        if (grp.amount > 0) {
            // Debit COGS (Purchase Account)
            accountingEntries.push({
                entryType: "DEBIT",
                accountCode: grp.accountCode,
                accountName: grp.accountName,
                amount: grp.amount,
                description: `Cost of goods sold for WO ${wo.workOrderNumber}`,
            });
            // Credit Inventory Asset
            accountingEntries.push({
                entryType: "CREDIT",
                accountCode: grp.invCode,
                accountName: grp.invName,
                amount: grp.amount,
                description: `Inventory reduction for WO ${wo.workOrderNumber}`,
            });
        }
    }

    if (miscTotal > 0) {
        let amt = Math.round(miscTotal * revenueFactor * 100) / 100;
        // Sweep any penny rounding differences on the last entry if it's safe
        if (Math.abs(remainingPreTax - amt) < 0.1) {
            amt = Math.round(remainingPreTax * 100) / 100;
        }
        remainingPreTax -= amt;
        accountingEntries.push({
            entryType: "CREDIT",
            accountCode: "4010",
            accountName: "Workshop Service Income",
            amount: amt,
            description: `Misc service income for WO ${wo.workOrderNumber}`,
        });
    } else {
        // If no misc items, sweep the penny rounding differences on the last pushed revenue entry
        if (remainingPreTax !== 0 && Math.abs(remainingPreTax) < 0.1) {
            for (let i = accountingEntries.length - 1; i >= 0; i--) {
                if (accountingEntries[i].entryType === "CREDIT" && accountingEntries[i].accountCode !== "2200") {
                    accountingEntries[i].amount = Math.round((accountingEntries[i].amount + remainingPreTax) * 100) / 100;
                    remainingPreTax = 0;
                    break;
                }
            }
        }
    }

    if (taxAmount > 0) {
        accountingEntries.push({
            entryType: "CREDIT",
            accountCode: "2200", // Sales Tax Payable
            accountName: "VAT/Sales Tax Payable",
            amount: taxAmount,
            description: `Tax on WO ${wo.workOrderNumber}`,
        });
    }

    const billData = {
        billNumber: `BILL-WO-${wo.workOrderNumber.split('-').pop()}-${Date.now().toString().slice(-4)}`,
        workOrderId: wo._id,
        vehicleId: wo.vehicleId,
        branchId: wo.branchId,
        isDriverBilled: !!options.isDriverBilled,
        lineItems,
        subtotal,
        taxProfileId,
        taxName,
        taxRate,
        taxAmount,
        discount,
        totalAmount,
        labourSummary: {
            totalHours: actualHours,
            hourlyRate,
            labourTotal: actualHours * hourlyRate,
        },
        accountingEntries,
        notes: options.notes || `Auto-generated bill for Work Order ${wo.workOrderNumber}`,
        createdBy: user.id,
        creatorRole: user.role,
    };

    return await createBill(billData);
};

const { generateWorkshopInvoiceNumber, addInvoiceService } = require("../../Invoice/Repo/InvoiceRepo");

/**
 * Approve a service bill.
 */
const approveBill = async (billId, user) => {
    const bill = await getBillById(billId);
    if (!bill) throw new Error("Service bill not found.", { cause: 404 });

    if (bill.status !== "DRAFT") {
        throw new Error(`Bill must be in DRAFT state. Current: ${bill.status}`, { cause: 400 });
    }

    const updatedBill = await updateBill(billId, {
        status: "APPROVED",
        approvedBy: user.id,
        approvedByRole: user.role,
        approvedAt: new Date(),
    });

    // Populate the updated bill to get vehicle and driver info for the invoice
    const fullyPopulatedBill = await getBillById(billId);

    // Always generate an invoice when a bill is approved
    try {
        const Customer = require("../../Customer/Model/CustomerModel");

        // If vehicle has a current driver, mark as driver billed
        const driverId = fullyPopulatedBill.vehicleId?.currentDriver?._id || fullyPopulatedBill.vehicleId?.currentDriver;
        if (driverId && !fullyPopulatedBill.isDriverBilled) {
            await updateBill(billId, { isDriverBilled: true });
            fullyPopulatedBill.isDriverBilled = true;
        }

        // Look up the customer from the driver, or use the default customer
        let customerId = null;
        if (driverId) {
            const customerDoc = await Customer.findOne({ driver: driverId, status: "ACTIVE" });
            if (customerDoc) {
                customerId = customerDoc._id;
            }
        }
        // Fallback to the default customer if no driver-linked customer found
        if (!customerId) {
            const mongoose = require("mongoose");
            const defaultCustId = "6a23e38bfec1624c663ce61c";
            const fallbackCustomer = await Customer.findById(defaultCustId);
            if (fallbackCustomer) {
                customerId = fallbackCustomer._id;
            } else {
                // Last resort: use the first active customer in the same branch
                const branchId = fullyPopulatedBill.branchId?._id || fullyPopulatedBill.branchId;
                const anyCustomer = await Customer.findOne({ branch: branchId, status: "ACTIVE" });
                if (anyCustomer) {
                    customerId = anyCustomer._id;
                } else {
                    throw new Error("No customer found to attach to the invoice. Please create a customer first.");
                }
            }
        }

        const invoiceNumber = await generateWorkshopInvoiceNumber();

        // Build line items for the invoice from the service bill
        const invoiceLineItems = (fullyPopulatedBill.lineItems || []).map(li => ({
            name: li.description,
            description: `${li.type} — ${li.description}`,
            qty: li.quantity,
            unitPrice: li.unitPrice,
            total: li.lineTotal,
            inventoryPart: li.partId || undefined,
        }));

        const invoiceData = {
            invoiceNumber,
            invoiceType: "WORKSHOP",
            customer: customerId,
            driver: driverId || undefined,
            vehicle: fullyPopulatedBill.vehicleId?._id || fullyPopulatedBill.vehicleId,
            serviceBill: fullyPopulatedBill._id,
            dueDate: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000), // Default 1 day due
            // Tax-inclusive totals
            lineItems: invoiceLineItems,
            subtotal: fullyPopulatedBill.subtotal || 0,
            taxRate: fullyPopulatedBill.taxRate || 0,
            taxAmount: fullyPopulatedBill.taxAmount || 0,
            tax: fullyPopulatedBill.taxProfileId || undefined,
            isTaxInclusive: true,
            baseAmount: fullyPopulatedBill.totalAmount - (fullyPopulatedBill.taxAmount || 0),
            totalAmountDue: fullyPopulatedBill.totalAmount,
            balance: fullyPopulatedBill.totalAmount,
            status: "PENDING",
            notes: `Workshop Service Bill ${fullyPopulatedBill.billNumber}${fullyPopulatedBill.taxName ? ` | Tax: ${fullyPopulatedBill.taxName} (${fullyPopulatedBill.taxRate}%)` : ''}`,
            createdBy: user.id,
            creatorRole: user.role
        };
        const invoice = await addInvoiceService(invoiceData);

        // Generate Ledger Entries for the Invoice
        const LedgerService = require("../../Ledger/Service/LedgerService");
        await LedgerService.generateInvoiceLedgerEntries(invoice);

        // Return the bill with the invoice number for the UI
        const billObj = fullyPopulatedBill.toObject ? fullyPopulatedBill.toObject() : fullyPopulatedBill;
        return {
            ...billObj,
            invoiceNumber: invoice.invoiceNumber
        };
    } catch (err) {
        console.error(`[ServiceBillService] Failed to generate invoice for bill ${billId}:`, err);
        // Still return the approved bill even if invoice generation fails
    }

    return fullyPopulatedBill;
};

/**
 * Add a payment to a service bill.
 */
const addPayment = async (billId, paymentData, user) => {
    const bill = await getBillById(billId);
    if (!bill) throw new Error("Service bill not found.", { cause: 404 });

    if (bill.status !== "APPROVED" && bill.status !== "PAID") {
        throw new Error("Bill must be APPROVED before recording payments.", { cause: 400 });
    }

    const amount = Number(paymentData.amount);
    if (isNaN(amount) || amount <= 0) {
        throw new Error("Invalid payment amount.", { cause: 400 });
    }

    const remainingBalance = bill.totalAmount - bill.amountPaid;
    if (amount > remainingBalance + 0.01) { // Small buffer for floating point
        throw new Error(`Payment amount ($${amount}) exceeds remaining balance ($${remainingBalance.toFixed(2)}).`, { cause: 400 });
    }

    // 1. Find Accounting Code for Cash/Bank (Asset)
    // Support custom code if provided (e.g. for choosing different bank accounts)
    const targetCode = paymentData.accountingCode || "1100";
    const accCode = await AccountingCode.findOne({ code: targetCode, isDeleted: false }) ||
        await AccountingCode.findOne({ category: "ASSET", isDeleted: false });

    if (!accCode) throw new Error("Accounting code for payment not found. Please ensure code 1100 (Cash) exists.", { cause: 500 });

    // 2. Create Payment Transaction
    // Debit Asset (1100), Credit Receivable (1200)
    const transactionData = {
        accountingCode: accCode._id,
        referenceId: bill._id,
        referenceModel: "ServiceBill",
        transactionCategory: accCode.category,
        transactionType: "DEBIT", // Debiting the Asset (Cash/Bank)
        isTaxInclusive: true,
        baseAmount: amount,
        totalAmount: amount,
        paymentMethod: paymentData.paymentMethod.toUpperCase().replace(" ", "_"),
        status: "COMPLETED",
        paymentDate: paymentData.paidAt || new Date(),
        notes: paymentData.notes || `Payment for Bill ${bill.billNumber}`,
        createdBy: user.id,
        creatorRole: user.role
    };

    const transaction = await addPaymentTransactionService(transactionData);

    // 3. Trigger Ledger Entry
    await autoGenerateLedgerEntry(transaction);

    // 4. Update Bill
    const newAmountPaid = (bill.amountPaid || 0) + amount;
    const newPaymentStatus = newAmountPaid >= bill.totalAmount - 0.01 ? "PAID" : "PARTIAL";
    const newStatus = newPaymentStatus === "PAID" ? "PAID" : bill.status;

    const paymentEntry = {
        amount,
        paidAt: paymentData.paidAt || new Date(),
        paymentMethod: paymentData.paymentMethod,
        paymentReference: paymentData.paymentReference,
        transactionId: transaction._id,
        recordedBy: user.id,
        notes: paymentData.notes
    };

    const updatedBill = await updateBill(billId, {
        $inc: { amountPaid: amount },
        $push: { payments: paymentEntry },
        $set: {
            paymentStatus: newPaymentStatus,
            status: newStatus,
            paidAt: newPaymentStatus === "PAID" ? new Date() : undefined
        }
    });

    // 5. Sync with Invoice if exists
    try {
        const { Invoice } = require("../../Invoice/Model/InvoiceModel");
        const invoice = await Invoice.findOne({ serviceBill: billId });
        if (invoice) {
            const newInvoiceAmountPaid = (invoice.amountPaid || 0) + amount;
            const newInvoiceBalance = Math.max(0, invoice.totalAmountDue - newInvoiceAmountPaid);
            let newInvoiceStatus = "PENDING";
            if (newInvoiceBalance <= 0) newInvoiceStatus = "PAID";
            else if (newInvoiceAmountPaid > 0) newInvoiceStatus = "PARTIAL";

            const invoicePaymentRecord = {
                amount: amount,
                paidAt: paymentData.paidAt || new Date(),
                paymentMethod: paymentData.paymentMethod || "Cash",
                transactionId: transaction._id,
                note: paymentData.notes || `Payment synced from Service Bill ${bill.billNumber}`,
            };

            await Invoice.findByIdAndUpdate(invoice._id, {
                $set: {
                    amountPaid: newInvoiceAmountPaid,
                    balance: newInvoiceBalance,
                    status: newInvoiceStatus,
                    paidAt: newInvoiceStatus === "PAID" ? new Date() : invoice.paidAt
                },
                $push: { payments: invoicePaymentRecord }
            });
            console.log(`[ServiceBillService] Synced payment to Invoice ${invoice.invoiceNumber}`);
        }
    } catch (err) {
        console.error(`[ServiceBillService] Failed to sync payment to invoice for bill ${billId}:`, err);
    }

    return updatedBill;
};

/**
 * Void a bill.
 */
const voidBill = async (billId, reason) => {
    if (!reason) throw new Error("Void reason is required.", { cause: 400 });
    return await updateBill(billId, { status: "VOID", voidReason: reason });
};

module.exports = {
    generateFromWorkOrder,
    approveBill,
    addPayment,
    voidBill,
};
