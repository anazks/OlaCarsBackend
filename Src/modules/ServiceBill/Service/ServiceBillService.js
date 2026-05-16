const { createBill, getBillById, updateBill } = require("../Repo/ServiceBillRepo");
const { getWorkOrderById } = require("../../WorkOrder/Repo/WorkOrderRepo");
const { addPaymentTransactionService } = require("../../Payment/Repo/PaymentTransactionRepo");
const { autoGenerateLedgerEntry } = require("../../Ledger/Service/LedgerService");
const AccountingCode = require("../../AccountingCode/Model/AccountingCodeModel");

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

    const hourlyRate = options.hourlyRate || 50;
    const taxRate = options.taxRate || 0;
    const discount = options.discount || 0;

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
    const taxAmount = Math.round(subtotal * (taxRate / 100) * 100) / 100;
    const totalAmount = subtotal + taxAmount - discount;

    // Build accounting entries (Initial recognition)
    // We'll use 4010 as the primary Income account
    const accountingEntries = [
        {
            entryType: "DEBIT",
            accountCode: "1200", // Accounts Receivable
            accountName: "Accounts Receivable",
            amount: totalAmount,
            description: `Receivable for Workshop Bill ${wo.workOrderNumber}`,
        }
    ];

    if (labourTotal > 0) {
        accountingEntries.push({
            entryType: "CREDIT",
            accountCode: "4030",
            accountName: "Labour Charges Income",
            amount: labourTotal,
            description: `Labour income for WO ${wo.workOrderNumber}`,
        });
    }

    if (partsTotal > 0) {
        accountingEntries.push({
            entryType: "CREDIT",
            accountCode: "4040",
            accountName: "Spare Parts Sales",
            amount: partsTotal,
            description: `Parts sales for WO ${wo.workOrderNumber}`,
        });
    }

    if (miscTotal > 0) {
        accountingEntries.push({
            entryType: "CREDIT",
            accountCode: "4010",
            accountName: "Workshop Service Income",
            amount: miscTotal,
            description: `Misc service income for WO ${wo.workOrderNumber}`,
        });
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

    // If driver billed, generate an official Invoice record
    if (fullyPopulatedBill.isDriverBilled) {
        if (!fullyPopulatedBill.vehicleId?.currentDriver) {
            console.error(`[ServiceBillService] Cannot generate invoice for bill ${billId}: No current driver assigned to vehicle.`);
        } else {
            try {
                const invoiceNumber = await generateWorkshopInvoiceNumber();
                const invoiceData = {
                    invoiceNumber,
                    invoiceType: "WORKSHOP",
                    driver: fullyPopulatedBill.vehicleId.currentDriver._id || fullyPopulatedBill.vehicleId.currentDriver,
                    vehicle: fullyPopulatedBill.vehicleId._id || fullyPopulatedBill.vehicleId,
                    serviceBill: fullyPopulatedBill._id,
                    dueDate: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000), // Default 1 day due
                    baseAmount: fullyPopulatedBill.totalAmount,
                    totalAmountDue: fullyPopulatedBill.totalAmount,
                    balance: fullyPopulatedBill.totalAmount,
                    status: "PENDING",
                    createdBy: user.id,
                    creatorRole: user.role
                };
                const invoice = await addInvoiceService(invoiceData);
                
                // Return the bill with the temporary invoice number for the UI
                return { 
                    ...fullyPopulatedBill.toObject(), 
                    invoiceNumber: invoice.invoiceNumber 
                };
            } catch (err) {
                console.error(`[ServiceBillService] Failed to generate invoice for bill ${billId}:`, err);
            }
        }
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
        paymentStatus: newPaymentStatus,
        status: newStatus,
        paidAt: newPaymentStatus === "PAID" ? new Date() : undefined
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
                amountPaid: newInvoiceAmountPaid,
                balance: newInvoiceBalance,
                status: newInvoiceStatus,
                paidAt: newInvoiceStatus === "PAID" ? new Date() : invoice.paidAt,
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
