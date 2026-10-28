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
    const billableStatuses = [
        "BILLING",
        "QC_PHOTOS",
        "QUALITY_CHECK",
        "READY_FOR_RELEASE",
        "VEHICLE_RELEASED",
        "INVOICED",
        "CLOSED",
    ];
    if (!billableStatuses.includes(wo.status)) {
        throw new Error(
            `Work order must be in a billable state (QC/Billing onwards) to generate a bill. Current status: ${wo.status}`,
            { cause: 400 }
        );
    }

    const { getSetting } = require("../../SystemSettings/Repo/SystemSettingsRepo");
    const configuredHourlyRate = (await getSetting("hourlyLabourRate")) || 150;
    const hourlyRate = options.hourlyRate !== undefined ? Number(options.hourlyRate) : configuredHourlyRate;
    const discount = options.discount || 0;

    // ─── Tax Profile: Auto-fetch ITBMS (7%) from Tax collection if no explicit rate ───
    let taxRate = 7;
    let taxName = "ITBMS 7%";
    let taxProfileId = null;

    if (options.taxProfileId) {
        taxProfileId = options.taxProfileId;
        try {
            const profile = await Tax.findById(options.taxProfileId);
            if (profile) {
                taxRate = options.taxRate !== undefined && options.taxRate !== null ? Number(options.taxRate) : profile.rate;
                taxName = options.taxName || profile.name;
            } else {
                taxRate = options.taxRate !== undefined && options.taxRate !== null ? Number(options.taxRate) : 7;
                taxName = options.taxName || "ITBMS 7%";
            }
        } catch {
            taxRate = options.taxRate !== undefined && options.taxRate !== null ? Number(options.taxRate) : 7;
            taxName = options.taxName || "ITBMS 7%";
        }
    } else if (options.taxRate !== undefined && options.taxRate !== null) {
        // Explicit tax rate passed from frontend (user override)
        taxRate = Number(options.taxRate);
        taxName = options.taxName || (taxRate === 7 ? "ITBMS 7%" : "Custom Tax");
    } else {
        // Auto-fetch ITBMS 7% tax profile (default workshop tax)
        try {
            const itbmsTax = await Tax.findOne({
                name: { $regex: /ITBMS/i },
                rate: 7,
                isActive: true,
                isDeleted: { $ne: true }
            }) || await Tax.findOne({
                name: { $regex: /ITBMS/i },
                isActive: true,
                isDeleted: { $ne: true }
            });
            if (itbmsTax) {
                taxRate = itbmsTax.rate;
                taxName = itbmsTax.name;
                taxProfileId = itbmsTax._id;
                console.log(`[ServiceBill] Auto-applied default tax profile: ${itbmsTax.name} @ ${itbmsTax.rate}%`);
            } else {
                taxRate = 7;
                taxName = "ITBMS 7%";
            }
        } catch (err) {
            console.error("[ServiceBill] Failed to fetch tax profile:", err.message);
            taxRate = 7;
            taxName = "ITBMS 7%";
        }
    }

    // Build line items from parts
    const lineItems = [];

    for (const part of wo.parts || []) {
        if (part.status === "INSTALLED") {
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

    const subtotal = Math.round((partsTotal + labourTotal + miscTotal) * 100) / 100;

    // ─── EXCLUSIVE Tax Calculation ───
    // Subtotal (parts + labour + misc) is the taxable amount before tax
    const taxableSubtotal = Math.max(0, Math.round((subtotal - discount) * 100) / 100);
    const taxAmount = Math.round(taxableSubtotal * (taxRate / 100) * 100) / 100;
    const totalAmount = Math.round((taxableSubtotal + taxAmount) * 100) / 100;

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

    if (discount > 0) {
        accountingEntries.push({
            entryType: "DEBIT",
            accountCode: "4900", // Discounts Allowed
            accountName: "Discounts Allowed",
            amount: Math.round(discount * 100) / 100,
            description: `Discount on Workshop Bill ${wo.workOrderNumber}`,
        });
    }

    if (labourTotal > 0) {
        accountingEntries.push({
            entryType: "CREDIT",
            accountCode: "4030",
            accountName: "Labour Charges Income",
            amount: Math.round(labourTotal * 100) / 100,
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
            accountingEntries.push({
                entryType: "CREDIT",
                accountCode: grp.accountCode,
                accountName: grp.accountName,
                amount: Math.round(grp.amount * 100) / 100,
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
        accountingEntries.push({
            entryType: "CREDIT",
            accountCode: "4010",
            accountName: "Workshop Service Income",
            amount: Math.round(miscTotal * 100) / 100,
            description: `Misc service income for WO ${wo.workOrderNumber}`,
        });
    }

    if (taxAmount > 0) {
        accountingEntries.push({
            entryType: "CREDIT",
            accountCode: "2200", // Sales Tax Payable
            accountName: "ITBMS/Tax Payable",
            amount: taxAmount,
            description: `ITBMS (${taxRate}%) on WO ${wo.workOrderNumber}`,
        });
    }

    const billData = {
        billNumber: `BILL-WO-${wo.workOrderNumber.split('-').pop()}-${Date.now().toString().slice(-4)}`,
        workOrderId: wo._id,
        vehicleId: wo.vehicleId,
        branchId: wo.branchId,
        isDriverBilled: !!options.isDriverBilled,
        driverId: options.driverId || undefined,
        customerId: options.customerId || undefined,
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

        // Prioritize driverId explicitly saved on the bill, else fallback to currentDriver on vehicle
        let driverId = fullyPopulatedBill.driverId?._id || fullyPopulatedBill.driverId || fullyPopulatedBill.vehicleId?.currentDriver?._id || fullyPopulatedBill.vehicleId?.currentDriver;
        if (driverId && !fullyPopulatedBill.isDriverBilled) {
            await updateBill(billId, { isDriverBilled: true, driverId });
            fullyPopulatedBill.isDriverBilled = true;
            fullyPopulatedBill.driverId = driverId;
        }

        // Look up the customer from customerId on the bill, or driver, or default customer
        let customerId = fullyPopulatedBill.customerId?._id || fullyPopulatedBill.customerId || null;
        if (!customerId && driverId) {
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
            // Tax-exclusive totals
            lineItems: invoiceLineItems,
            subtotal: fullyPopulatedBill.subtotal || 0,
            taxRate: fullyPopulatedBill.taxRate || 0,
            taxAmount: fullyPopulatedBill.taxAmount || 0,
            tax: fullyPopulatedBill.taxProfileId || undefined,
            isTaxInclusive: false,
            baseAmount: fullyPopulatedBill.subtotal || (fullyPopulatedBill.totalAmount - (fullyPopulatedBill.taxAmount || 0)),
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

/**
 * Edit a draft service bill before approval.
 * Updates line items, driver/customer, tax, discount, notes and recalculates totals and entries.
 */
const updateDraftBill = async (billId, updateData = {}, user) => {
    const { ServiceBill } = require("../Model/ServiceBillModel");
    const bill = await ServiceBill.findById(billId);
    if (!bill) {
        throw new Error("Service bill not found.", { cause: 404 });
    }

    if (bill.status !== "DRAFT") {
        throw new Error(`Only DRAFT bills can be edited. This bill is already ${bill.status}.`, { cause: 400 });
    }

    // 1. Line Items
    if (updateData.lineItems && Array.isArray(updateData.lineItems)) {
        bill.lineItems = updateData.lineItems.map(item => ({
            type: ["LABOUR", "PART", "MISC"].includes(item.type) ? item.type : "PART",
            description: String(item.description || "Service Item").trim(),
            quantity: Math.max(0, Number(item.quantity) || 1),
            unitPrice: Math.max(0, Number(item.unitPrice) || 0),
            lineTotal: Math.round((Math.max(0, Number(item.quantity) || 1) * Math.max(0, Number(item.unitPrice) || 0)) * 100) / 100,
            partId: item.partId || undefined
        }));
    }

    // 2. Driver / Customer
    if (updateData.isDriverBilled !== undefined) {
        bill.isDriverBilled = Boolean(updateData.isDriverBilled);
    }
    if (bill.isDriverBilled) {
        if (updateData.driverId !== undefined) {
            bill.driverId = updateData.driverId || null;
        }
        if (updateData.customerId !== undefined) {
            bill.customerId = updateData.customerId || null;
        }
        // Auto-find customer if driver provided without customer
        if (bill.driverId && !bill.customerId) {
            const Customer = require("../../Customer/Model/CustomerModel");
            const customerDoc = await Customer.findOne({ driver: bill.driverId, status: "ACTIVE" });
            if (customerDoc) {
                bill.customerId = customerDoc._id;
            }
        }
    } else {
        if (updateData.isDriverBilled === false) {
            bill.driverId = null;
            bill.customerId = null;
        }
    }

    // 3. Tax & Discount & Notes
    if (updateData.taxRate !== undefined && updateData.taxRate !== null) {
        bill.taxRate = Number(updateData.taxRate);
    }
    if (updateData.taxName) {
        bill.taxName = String(updateData.taxName).trim();
    }
    if (updateData.taxProfileId !== undefined) {
        bill.taxProfileId = updateData.taxProfileId || undefined;
    }
    if (updateData.discount !== undefined) {
        bill.discount = Math.max(0, Number(updateData.discount) || 0);
    }
    if (updateData.notes !== undefined) {
        bill.notes = updateData.notes;
    }

    // 4. Recalculate Totals (Tax Exclusive)
    const partsTotal = bill.lineItems.filter(i => i.type === "PART").reduce((sum, item) => sum + item.lineTotal, 0);
    const labourTotal = bill.lineItems.filter(i => i.type === "LABOUR").reduce((sum, item) => sum + item.lineTotal, 0);
    const miscTotal = bill.lineItems.filter(i => i.type === "MISC").reduce((sum, item) => sum + item.lineTotal, 0);

    bill.subtotal = Math.round((partsTotal + labourTotal + miscTotal) * 100) / 100;
    const taxableSubtotal = Math.max(0, Math.round((bill.subtotal - (bill.discount || 0)) * 100) / 100);
    bill.taxAmount = Math.round(taxableSubtotal * ((bill.taxRate || 0) / 100) * 100) / 100;
    bill.totalAmount = Math.round((taxableSubtotal + bill.taxAmount) * 100) / 100;

    // 5. Update Labour Summary if labour changed
    const labourItems = bill.lineItems.filter(i => i.type === "LABOUR");
    if (labourItems.length > 0) {
        const totalHours = labourItems.reduce((sum, item) => sum + item.quantity, 0);
        const avgRate = totalHours > 0 ? (labourTotal / totalHours) : (bill.labourSummary?.hourlyRate || 150);
        bill.labourSummary = {
            totalHours,
            hourlyRate: Math.round(avgRate * 100) / 100,
            labourTotal: Math.round(labourTotal * 100) / 100
        };
    }

    // 6. Recalculate Accounting Entries
    const arCodeDoc = await AccountingCode.findOne({ code: "1100" }) || await AccountingCode.findOne({ code: "1200" });
    const arCode = arCodeDoc ? arCodeDoc.code : "1100";
    const billRefNumber = bill.billNumber;

    const accountingEntries = [
        {
            entryType: "DEBIT",
            accountCode: arCode,
            accountName: "Accounts Receivable",
            amount: bill.totalAmount,
            description: `Receivable for Workshop Bill ${billRefNumber}`,
        }
    ];

    if (bill.discount > 0) {
        accountingEntries.push({
            entryType: "DEBIT",
            accountCode: "4900",
            accountName: "Discounts Allowed",
            amount: Math.round(bill.discount * 100) / 100,
            description: `Discount on Workshop Bill ${billRefNumber}`,
        });
    }

    if (labourTotal > 0) {
        accountingEntries.push({
            entryType: "CREDIT",
            accountCode: "4030",
            accountName: "Labour Charges Income",
            amount: Math.round(labourTotal * 100) / 100,
            description: `Labour income for Workshop Bill ${billRefNumber}`,
        });
    }

    if (partsTotal > 0) {
        const fallbackIncome = await AccountingCode.findOne({ code: "IN0008" }) || await AccountingCode.findOne({ code: "4040" }) || { code: "4040", name: "Spare Parts Sales" };
        accountingEntries.push({
            entryType: "CREDIT",
            accountCode: fallbackIncome.code,
            accountName: fallbackIncome.name || "Parts Sales Income",
            amount: Math.round(partsTotal * 100) / 100,
            description: `Parts sales for Workshop Bill ${billRefNumber}`,
        });
    }

    if (miscTotal > 0) {
        accountingEntries.push({
            entryType: "CREDIT",
            accountCode: "4010",
            accountName: "Workshop Service Income",
            amount: Math.round(miscTotal * 100) / 100,
            description: `Misc service income for Workshop Bill ${billRefNumber}`,
        });
    }

    if (bill.taxAmount > 0) {
        accountingEntries.push({
            entryType: "CREDIT",
            accountCode: "2200",
            accountName: "ITBMS/Tax Payable",
            amount: bill.taxAmount,
            description: `ITBMS (${bill.taxRate}%) on Workshop Bill ${billRefNumber}`,
        });
    }

    bill.accountingEntries = accountingEntries;
    await bill.save();

    return await getBillById(bill._id);
};

module.exports = {
    generateFromWorkOrder,
    approveBill,
    updateDraftBill,
    addPayment,
    voidBill,
};
