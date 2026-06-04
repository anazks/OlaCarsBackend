const {
    addManyInvoicesService,
    getInvoicesService,
    getInvoiceByIdService,
    updateInvoiceService,
    deleteInvoiceService,
    deleteAllInvoicesService
} = require("../Repo/InvoiceRepo");
const { Invoice } = require("../Model/InvoiceModel");
const PaymentTransaction = require("../../Payment/Model/PaymentTransactionModel");
const LedgerService = require("../../Ledger/Service/LedgerService");
const { Vehicle } = require("../../Vehicle/Model/VehicleModel");
const { Driver } = require("../../Driver/Model/DriverModel");
const Tax = require("../../Tax/Model/TaxModel");

const getNextInvoiceNumberVal = async () => {
    const lastInvoice = await Invoice.findOne({ 
        invoiceNumber: /^INV-\d{6}$/ 
    }).sort({ invoiceNumber: -1 });

    let nextNum = 1;
    if (lastInvoice) {
        const match = lastInvoice.invoiceNumber.match(/^INV-(\d{6})$/);
        if (match) {
            nextNum = parseInt(match[1], 10) + 1;
        }
    }
    return nextNum;
};

const formatInvoiceNumber = (num) => {
    return `INV-${String(num).padStart(6, '0')}`;
};

exports.getNextInvoiceNumberVal = getNextInvoiceNumberVal;
exports.formatInvoiceNumber = formatInvoiceNumber;

exports.getAll = async (queryParams = {}, options = {}) => {
    return await getInvoicesService(queryParams, options);
};

exports.getRegistry = async (queryParams = {}) => {
    // Specifically for the registry page, uses standard list logic with search/date filters
    return await getInvoicesService(queryParams);
};

exports.getPendingByDriver = async (driverId) => {
    const { getPendingByDriverService } = require("../Repo/InvoiceRepo");
    return await getPendingByDriverService(driverId);
};

exports.getById = async (id) => {
    return await getInvoiceByIdService(id);
};

exports.generateRentInvoices = async (driverId, vehicleId, amount, count, frequency = 'MONTHLY', createdBy, creatorRole, session = null) => {
    const assignmentDate = new Date();
    assignmentDate.setHours(0, 0, 0, 0);

    const isWeekly = frequency.toUpperCase() === 'WEEKLY';
    let nextDueDate = new Date(assignmentDate);

    if (isWeekly) {
        // Set to the first Wednesday after assignment
        const currentDay = nextDueDate.getDay();
        const daysUntilWed = (3 - currentDay + 7) % 7;
        const offset = daysUntilWed === 0 ? 7 : daysUntilWed;
        nextDueDate.setDate(nextDueDate.getDate() + offset);
    } else {
        // Monthly: 1st of the month after assignment
        nextDueDate.setMonth(nextDueDate.getMonth() + 1);
        nextDueDate.setDate(1);
    }

    const activeTax = await Tax.findOne({ isActive: true, isDeleted: false });
    const taxRate = activeTax ? activeTax.rate : 0;
    const startSeq = await getNextInvoiceNumberVal();

    const invoicesData = [];

    // ONLY generate the first invoice (Week/Month 1) upon assignment
    const generateCount = 1;

    for (let i = 0; i < generateCount; i++) {
        const dueDate = new Date(nextDueDate);
        if (isWeekly) {
            dueDate.setDate(nextDueDate.getDate() + (i * 7));
        } else {
            dueDate.setMonth(nextDueDate.getMonth() + i);
            dueDate.setDate(1);
        }

        const periodNum = i + 1;
        const invoiceNumber = formatInvoiceNumber(startSeq + i);
        const taxAmount = taxRate > 0 ? Math.round((amount * taxRate / 100) * 100) / 100 : 0;
        const totalDue = Math.round((amount + taxAmount) * 100) / 100;

        invoicesData.push({
            invoiceNumber,
            driver: driverId,
            vehicle: vehicleId,
            weekNumber: periodNum,
            weekLabel: isWeekly
                ? `Week ${periodNum} - ${dueDate.toLocaleDateString('en-US', { day: 'numeric', month: 'short' })}`
                : `Month ${periodNum} - ${dueDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`,
            dueDate: dueDate,
            baseAmount: amount,
            carryOverAmount: 0,
            tax: activeTax ? activeTax._id : undefined,
            taxRate,
            taxAmount,
            totalAmountDue: totalDue,
            amountPaid: 0,
            balance: totalDue,
            status: "PENDING",
            payments: [],
            createdBy,
            creatorRole
        });
    }

    const createdInvoices = await addManyInvoicesService(invoicesData, session);
    if (createdInvoices && createdInvoices.length > 0) {
        for (const inv of createdInvoices) {
            try {
                await LedgerService.generateInvoiceLedgerEntries(inv);
            } catch (ledgerErr) {
                console.error("[InvoiceService] Failed to generate ledger entries for rent invoice:", ledgerErr);
            }
        }
    }
    return createdInvoices;
};

exports.payInvoice = async (invoiceId, paymentData) => {
    const { amount, paymentMethod, transactionId, note, createdBy, creatorRole } = paymentData;
    if (!amount || amount <= 0) throw new Error("Payment amount must be greater than 0");

    const invoice = await Invoice.findById(invoiceId);
    if (!invoice || invoice.isDeleted) throw new Error("Invoice not found");
    if (invoice.status === "PAID") throw new Error("Invoice is already fully paid");

    if (paymentMethod === "PREPAYMENT_CREDIT") {
        // Settle this invoice using the driver's available prepayment credits, up to the specified amount
        const PaymentReceived = require("../../PaymentReceived/Model/PaymentReceivedModel");
        const payments = await PaymentReceived.find({ driverId: invoice.driver, status: 'COMPLETED' });

        let remainingToApply = amount; // the amount the user wants to pay using prepayment credit
        if (remainingToApply > invoice.balance) {
            remainingToApply = invoice.balance;
        }

        let totalAppliedFromCredit = 0;

        for (const payment of payments) {
            if (remainingToApply <= 0) break;

            const amountAppliedTotal = payment.invoices?.reduce((sum, inv) => sum + (inv.amountApplied || 0), 0) || 0;
            const unappliedAmount = Math.max(0, payment.amountReceived - amountAppliedTotal);

            if (unappliedAmount > 0) {
                const toApply = Math.min(remainingToApply, unappliedAmount);
                if (toApply > 0) {
                    // 1. Update PaymentReceived record's invoices array
                    payment.invoices.push({
                        invoiceId: invoice._id,
                        invoiceNumber: invoice.invoiceNumber,
                        amountApplied: toApply
                    });
                    await payment.save();

                    // 2. Add payment record to the Invoice
                    const paymentRecord = {
                        amount: toApply,
                        paidAt: new Date(),
                        paymentMethod: "Prepayment Credit",
                        transactionId: payment.referenceNumber || payment.paymentNumber || undefined,
                        note: note || `Applied prepayment credit from ${payment.paymentNumber}`,
                    };

                    invoice.payments.push(paymentRecord);

                    remainingToApply -= toApply;
                    totalAppliedFromCredit += toApply;
                }
            }
        }

        if (totalAppliedFromCredit <= 0) {
            throw new Error("No available prepayment credit found for this driver");
        }

        const newPaid = (invoice.amountPaid || 0) + totalAppliedFromCredit;
        const newBalance = Math.max(0, invoice.totalAmountDue - newPaid);
        const newStatus = newBalance <= 0 ? "PAID" : "PARTIAL";

        invoice.amountPaid = newPaid;
        invoice.balance = newBalance;
        invoice.status = newStatus;
        if (newStatus === "PAID" && !invoice.paidAt) {
            invoice.paidAt = new Date();
        }

        await invoice.save();
        await exports.syncInvoiceToAdditionalPayments(invoice);

        // Roll over carry over across all invoices
        await exports.rolloverDriverInvoices(invoice.driver);

        return invoice;
    }

    const timestamp = new Date();

    // Apply payment directly to this invoice (the controller or frontend could choose the oldest unpaid)
    let newPaid = (invoice.amountPaid || 0) + amount;
    let newBalance = Math.max(0, invoice.totalAmountDue - newPaid);
    let newStatus = "PENDING";

    // Evaluate if we have overpaid
    let excessAmount = 0;
    if (newPaid > invoice.totalAmountDue) {
        excessAmount = newPaid - invoice.totalAmountDue;
        newPaid = invoice.totalAmountDue;
        newBalance = 0;
    }

    if (newBalance <= 0) newStatus = "PAID";
    else if (newPaid > 0) newStatus = "PARTIAL";

    const paymentRecord = {
        amount: amount - excessAmount,
        paidAt: timestamp,
        paymentMethod: paymentMethod || "Cash",
        transactionId: transactionId || undefined,
        note: note,
    };

    const updateData = {
        $set: {
            amountPaid: newPaid,
            balance: newBalance,
            status: newStatus
        },
        $push: { payments: paymentRecord }
    };
    if (newStatus === "PAID" && !invoice.paidAt) {
        updateData.$set.paidAt = timestamp;
    }

    const updatedInvoice = await Invoice.findByIdAndUpdate(invoiceId, updateData, { new: true });
    await exports.syncInvoiceToAdditionalPayments(updatedInvoice);

    // Sync with Service Bill if it's a workshop invoice
    if (updatedInvoice.invoiceType === 'WORKSHOP' && updatedInvoice.serviceBill) {
        try {
            const { ServiceBill } = require("../../ServiceBill/Model/ServiceBillModel");
            const bill = await ServiceBill.findById(updatedInvoice.serviceBill);
            if (bill) {
                const billAmount = amount - excessAmount; // Only apply the amount that went to this invoice
                const newBillAmountPaid = (bill.amountPaid || 0) + billAmount;
                const newBillPaymentStatus = newBillAmountPaid >= bill.totalAmount - 0.01 ? "PAID" : "PARTIAL";
                const newBillStatus = newBillPaymentStatus === "PAID" ? "PAID" : bill.status;

                const billPaymentEntry = {
                    amount: billAmount,
                    paidAt: timestamp,
                    paymentMethod: paymentMethod || "Cash",
                    paymentReference: transactionId,
                    notes: note || `Payment synced from Invoice ${updatedInvoice.invoiceNumber}`,
                    recordedBy: createdBy
                };

                await ServiceBill.findByIdAndUpdate(bill._id, {
                    $inc: { amountPaid: billAmount },
                    $push: { payments: billPaymentEntry },
                    $set: {
                        paymentStatus: newBillPaymentStatus,
                        status: newBillStatus,
                        paidAt: newBillPaymentStatus === "PAID" ? timestamp : bill.paidAt
                    }
                });
                console.log(`[InvoiceService] Synced payment to Service Bill ${bill.billNumber}`);
            }
        } catch (err) {
            console.error(`[InvoiceService] Failed to sync payment to service bill for invoice ${invoiceId}:`, err);
        }
    }

    // Handle excess (apply to the next available invoice if possible)
    if (excessAmount > 0) {
        await this.applyExcessToNextInvoice(invoice.driver, excessAmount, paymentData);
    }

    // Ledger & Payment Transaction
    await this.createLedgerEntry(amount, paymentMethod, invoice, createdBy, creatorRole, note);

    // Roll over carry over across all invoices
    await this.rolloverDriverInvoices(invoice.driver);

    return updatedInvoice;
};

exports.applyExcessToNextInvoice = async (driverId, excessAmount, paymentData) => {
    // Find the next UNPAID invoice ordered by weekNumber
    const nextInvoices = await Invoice.find({ driver: driverId, status: { $ne: 'PAID' }, isDeleted: false })
        .sort({ weekNumber: 1 });

    let rem = excessAmount;
    for (const nextInv of nextInvoices) {
        if (rem <= 0) break;

        const toPay = Math.min(rem, nextInv.balance);
        if (toPay <= 0) continue;

        let newPaid = (nextInv.amountPaid || 0) + toPay;
        let newBalance = Math.max(0, nextInv.totalAmountDue - newPaid);
        let newStatus = newBalance <= 0 ? "PAID" : "PARTIAL";

        const paymentRecord = {
            amount: toPay,
            paidAt: new Date(),
            paymentMethod: paymentData.paymentMethod || "Cash",
            transactionId: paymentData.transactionId || undefined,
            note: "Rollover excess from previous payment",
        };

        const upd = {
            amountPaid: newPaid,
            balance: newBalance,
            status: newStatus,
            $push: { payments: paymentRecord }
        };
        if (newStatus === "PAID" && !nextInv.paidAt) {
            upd.paidAt = new Date();
        }
        const updatedInv = await Invoice.findByIdAndUpdate(nextInv._id, upd, { new: true });
        await exports.syncInvoiceToAdditionalPayments(updatedInv);
        rem -= toPay;
    }
}

exports.rolloverDriverInvoices = async (driverId) => {
    // Read all invoices sorted by week
    const invoices = await Invoice.find({ driver: driverId, isDeleted: false }).sort({ weekNumber: 1 });

    let totalCarryOver = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = 0; i < invoices.length; i++) {
        const inv = invoices[i];
        const isOverdue = inv.dueDate && new Date(inv.dueDate) < today;

        if (inv.status !== "PAID" && isOverdue) {
            // Unpaid and overdue: add its remaining balance to the accumulator
            totalCarryOver += inv.balance;
        } else if (inv.status !== "PAID" && !isOverdue) {
            // First Non-overdue pending invoice: absorb the carryover
            const newCarryOver = totalCarryOver;
            const newTotalDue = inv.baseAmount + newCarryOver;
            const newBalance = Math.max(0, newTotalDue - inv.amountPaid);

            if (inv.carryOverAmount !== newCarryOver || inv.totalAmountDue !== newTotalDue) {
                await Invoice.findByIdAndUpdate(inv._id, {
                    carryOverAmount: newCarryOver,
                    totalAmountDue: newTotalDue,
                    balance: newBalance
                });
            }

            // Stop applying carryover after we deposit it into the first upcoming valid week
            totalCarryOver = 0;
            break;
        }
    }
};

exports.createLedgerEntry = async (amount, paymentMethod, invoice, createdBy, creatorRole, note) => {
    try {
        console.log(`[InvoiceService] Starting ledger generation for invoice payment ${invoice.invoiceNumber}`);
        const mongoose = require("mongoose");
        const AccountingCode = require("../../AccountingCode/Model/AccountingCodeModel");
        const accCode = await AccountingCode.findOne({ code: "IN0002" }) || await AccountingCode.findOne({ code: "4100" });
        console.log(`[InvoiceService] AccountingCode found: ${accCode ? accCode.code : 'none'}`);

        if (accCode) {
            // Normalize paymentMethod to match PaymentTransaction enum
            let normalizedMethod = "OTHER";
            const methodUpper = paymentMethod ? paymentMethod.toUpperCase() : "CASH";

            if (methodUpper.includes("CASH")) normalizedMethod = "CASH";
            else if (methodUpper.includes("BANK") || methodUpper.includes("TRANSFER")) normalizedMethod = "BANK_TRANSFER";
            else if (methodUpper.includes("CARD")) normalizedMethod = "CREDIT_CARD";
            else if (methodUpper.includes("CHEQUE")) normalizedMethod = "CHEQUE";

            const transactionData = {
                accountingCode: accCode._id,
                referenceId: invoice.driver,
                referenceModel: "Driver",
                transactionCategory: "INCOME",
                transactionType: "CREDIT",
                isTaxInclusive: false,
                baseAmount: amount,
                totalAmount: amount,
                paymentMethod: normalizedMethod,
                status: "COMPLETED",
                paymentDate: new Date(),
                notes: `Invoice Payment (${invoice.invoiceNumber}) - Week ${invoice.weekNumber}${note ? ' - ' + note : ''}`,
                createdBy,
                creatorRole
            };

            console.log(`[InvoiceService] Creating PaymentTransaction for amount ${amount}`);
            const newTransaction = await PaymentTransaction.create(transactionData);
            console.log(`[InvoiceService] PaymentTransaction created: ${newTransaction._id}`);

            const populatedTx = { ...newTransaction.toObject(), accountingCode: accCode };
            // Skip direct ledger entry generation for the payment transaction.
            // The auto-created PaymentReceived double-entry below handles Cash Debit and Accounts Receivable Credit.
            console.log(`[InvoiceService] Skipping direct direct ledger entry generation for payment transaction ${newTransaction._id} to avoid double-booking.`);

            // Fetch driver details to get the branch
            const { Driver } = require("../../Driver/Model/DriverModel");
            const driverDoc = await Driver.findById(invoice.driver);
            const branchId = invoice.branch || (driverDoc ? driverDoc.branch : undefined);

            // Fetch a cash/bank asset account
            let cashBankAccount = await AccountingCode.findOne({ category: "ASSET", code: { $nin: ["1100", "1200"] } });
            if (!cashBankAccount) {
                cashBankAccount = await AccountingCode.findOne({ code: "1100" }) || await AccountingCode.findOne({ code: "1200" });
            }

            let prDoc = null;

            // Zoho Accounting Integration: Auto-create PaymentReceived record
            try {
                const PaymentReceived = require("../../PaymentReceived/Model/PaymentReceivedModel");

                const methodUpper2 = (paymentMethod || "").toUpperCase();
                let normalizedPRMethod = "Other";
                if (methodUpper2.includes("CASH")) normalizedPRMethod = "Cash";
                else if (methodUpper2.includes("BANK") || methodUpper2.includes("TRANSFER") || methodUpper2.includes("WIRE")) normalizedPRMethod = "Bank Transfer";
                else if (methodUpper2.includes("CARD") || methodUpper2.includes("POS")) normalizedPRMethod = "Card";
                else if (methodUpper2.includes("MOBILE") || methodUpper2.includes("MONEY")) normalizedPRMethod = "Mobile Money";

                const prData = {
                    paymentNumber: `PR-${Date.now()}`,
                    driverId: invoice.driver,
                    amountReceived: amount,
                    paymentDate: new Date(),
                    paymentMethod: normalizedPRMethod,
                    notes: `Invoice Payment (${invoice.invoiceNumber}) - Week ${invoice.weekNumber}${note ? ' - ' + note : ''}`,
                    depositedTo: cashBankAccount ? cashBankAccount._id : undefined, // Set the deposited account
                    branch: branchId,
                    invoices: [{
                        invoiceId: invoice._id,
                        invoiceNumber: invoice.invoiceNumber,
                        amountApplied: amount
                    }],
                    status: "COMPLETED"
                };
                prDoc = await PaymentReceived.create(prData);
                console.log(`[InvoiceService] PaymentReceived record created successfully: ${prDoc.paymentNumber}`);
            } catch (prErr) {
                console.error("[InvoiceService] Failed to auto-create PaymentReceived record:", prErr);
            }

            if (cashBankAccount) {
            

                
                // 5. Create a PaymentTransaction referencing the PaymentReceived record
                // This is transactionType: "DEBIT" on the Cash/Bank Asset Account, 
                // which LedgerService will process as: Debit Cash/Bank, Credit Accounts Receivable (1200).
                const prTransactionData = {
                    accountingCode: cashBankAccount._id,
                    referenceId: prDoc ? prDoc._id : invoice.driver,
                    referenceModel: prDoc ? "PaymentReceived" : "Driver",
                    transactionCategory: "ASSET",
                    transactionType: "DEBIT",
                    isTaxInclusive: false,
                    baseAmount: amount,
                    totalAmount: amount,
                    paymentMethod: normalizedMethod,
                    status: "COMPLETED",
                    paymentDate: new Date(),
                    notes: `Invoice Payment (${invoice.invoiceNumber}) - Week ${invoice.weekNumber}${note ? ' - ' + note : ''}`,
                    createdBy,
                    creatorRole
                };
                
                console.log(`[InvoiceService] Creating PaymentTransaction for amount ${amount}`);
                const prNewTransaction = await PaymentTransaction.create(prTransactionData);
                console.log(`[InvoiceService] PaymentTransaction created: ${prNewTransaction._id}`);
                
                const prPopulatedTx = { ...prNewTransaction.toObject(), accountingCode: cashBankAccount };
                await LedgerService.autoGenerateLedgerEntry(prPopulatedTx);
                console.log(`[InvoiceService] Ledger entry generation triggered for ${prNewTransaction._id}`);
            }
        } else {
            console.error("[InvoiceService] No Asset account found to debit for invoice payment.");
        }
    } catch (err) {
        console.error("[InvoiceService] Failed to generate ledger for invoice payment:", err);
    }
};

exports.createManualInvoice = async (data, createdBy, creatorRole) => {
    const {
        driver: driverId, vehicle: vehicleId, weekLabel, dueDate, invoiceDate,
        lineItems = [], discountType = 'PERCENTAGE', discountValue = 0,
        notes
    } = data;

    if (!driverId) throw new Error("Driver is required for manual invoice creation");
    if (!dueDate) throw new Error("Due date is required");
    if (!lineItems || lineItems.length === 0) throw new Error("At least one line item is required");

    // Compute subtotal from line items
    const enrichedLineItems = lineItems.map(item => ({
        name: item.name,
        description: item.description || '',
        qty: Number(item.qty) || 1,
        unitPrice: Number(item.unitPrice) || 0,
        total: Math.round((Number(item.qty) || 1) * (Number(item.unitPrice) || 0) * 100) / 100,
    }));

    const subtotal = enrichedLineItems.reduce((sum, item) => sum + item.total, 0);

    // Compute discount
    let discountAmount = 0;
    if (discountValue > 0) {
        if (discountType === 'PERCENTAGE') {
            discountAmount = Math.round((subtotal * discountValue / 100) * 100) / 100;
        } else {
            discountAmount = Math.min(Number(discountValue), subtotal);
        }
    }

    const afterDiscount = subtotal - discountAmount;

    // Fetch tax and compute tax rate
    let finalTaxRate = typeof data.taxRate === 'number' ? data.taxRate : 0;
    let taxDoc = null;
    if (data.tax) {
        taxDoc = await Tax.findById(data.tax);
        if (taxDoc) {
            finalTaxRate = taxDoc.rate;
        }
    } else {
        taxDoc = await Tax.findOne({ isActive: true, isDeleted: false });
        if (taxDoc) {
            finalTaxRate = taxDoc.rate;
        }
    }

    // Compute tax
    const taxAmount = finalTaxRate > 0 ? Math.round((afterDiscount * finalTaxRate / 100) * 100) / 100 : 0;
    const totalAmountDue = Math.round((afterDiscount + taxAmount) * 100) / 100;

    // Auto-assign weekNumber (next available for this driver)
    const existingInvoices = await Invoice.find({ driver: driverId, isDeleted: false }).sort({ weekNumber: -1 }).limit(1);
    const nextWeekNumber = existingInvoices.length > 0 ? (existingInvoices[0].weekNumber + 1) : 1;

    // Generate sequential manual invoice number
    const startSeq = await getNextInvoiceNumberVal();
    const invoiceNumber = formatInvoiceNumber(startSeq);

    const invoiceData = {
        invoiceNumber,
        driver: driverId,
        vehicle: vehicleId || undefined,
        weekNumber: nextWeekNumber,
        weekLabel: weekLabel || `Manual Invoice - ${new Date(dueDate).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })}`,
        dueDate: new Date(dueDate),
        generatedAt: invoiceDate ? new Date(invoiceDate) : new Date(),
        baseAmount: afterDiscount,
        carryOverAmount: 0,
        tax: taxDoc ? taxDoc._id : undefined,
        taxRate: finalTaxRate,
        taxAmount,
        totalAmountDue,
        amountPaid: 0,
        balance: totalAmountDue,
        status: data.status || 'PENDING',
        payments: [],
        // Manual invoice specific fields
        invoiceType: 'MANUAL',
        lineItems: enrichedLineItems,
        subtotal,
        discountType,
        discountValue: Number(discountValue),
        discountAmount,
        notes: notes || '',
        createdBy,
        creatorRole,
    };

    const newInvoice = await Invoice.create(invoiceData);
    if (newInvoice.status !== 'DRAFT') {
        try {
            await LedgerService.generateInvoiceLedgerEntries(newInvoice);
        } catch (ledgerErr) {
            console.error("[InvoiceService] Failed to generate ledger entries for manual invoice:", ledgerErr);
        }
        await exports.applyPrepaymentsToInvoice(newInvoice._id);
    }
    return await Invoice.findById(newInvoice._id).populate('driver', 'personalInfo driverId').populate('vehicle', 'plateNumber make model');
};

exports.applyPrepaymentsToInvoice = async (invoiceId) => {
    const { Invoice } = require("../Model/InvoiceModel");
    const PaymentReceived = require("../../PaymentReceived/Model/PaymentReceivedModel");

    const invoice = await Invoice.findById(invoiceId);
    if (!invoice || invoice.status === 'PAID') return;

    // Find all completed PaymentReceived records for this driver
    const payments = await PaymentReceived.find({ driverId: invoice.driver, status: 'COMPLETED' });

    let remainingToPay = invoice.balance;
    if (remainingToPay <= 0) return;

    for (const payment of payments) {
        if (remainingToPay <= 0) break;

        const amountAppliedTotal = payment.invoices?.reduce((sum, inv) => sum + (inv.amountApplied || 0), 0) || 0;
        const unappliedAmount = Math.max(0, payment.amountReceived - amountAppliedTotal);

        if (unappliedAmount > 0) {
            const toApply = Math.min(remainingToPay, unappliedAmount);
            if (toApply > 0) {
                // 1. Update PaymentReceived record's invoices array
                payment.invoices.push({
                    invoiceId: invoice._id,
                    invoiceNumber: invoice.invoiceNumber,
                    amountApplied: toApply
                });
                await payment.save();

                // 2. Add payment record to the Invoice
                const paymentRecord = {
                    amount: toApply,
                    paidAt: new Date(),
                    paymentMethod: payment.paymentMethod || "Cash",
                    transactionId: payment.referenceNumber || undefined,
                    note: `Applied prepayment from ${payment.paymentNumber}`,
                };

                const newPaid = (invoice.amountPaid || 0) + toApply;
                const newBalance = Math.max(0, invoice.totalAmountDue - newPaid);
                const newStatus = newBalance <= 0 ? "PAID" : "PARTIAL";

                invoice.amountPaid = newPaid;
                invoice.balance = newBalance;
                invoice.status = newStatus;
                invoice.payments.push(paymentRecord);
                if (newStatus === "PAID" && !invoice.paidAt) {
                    invoice.paidAt = new Date();
                }

                remainingToPay = newBalance;
            }
        }
    }

    if (remainingToPay < invoice.balance) {
        await invoice.save();
        await exports.syncInvoiceToAdditionalPayments(invoice);
        // Also trigger rollover driver invoices to maintain carryover calculations
        await exports.rolloverDriverInvoices(invoice.driver);
    }
};

exports.updateInvoice = async (id, data) => {
    const { Invoice } = require("../Model/InvoiceModel");
    const LedgerService = require("../../Ledger/Service/LedgerService");
    const invoice = await Invoice.findById(id);
    if (!invoice) throw new Error("Invoice not found");
    if (invoice.status === 'PAID') throw new Error("Cannot edit a fully paid invoice");

    const oldStatus = invoice.status;

    if (data.dueDate) invoice.dueDate = new Date(data.dueDate);
    if (data.weekLabel) invoice.weekLabel = data.weekLabel;

    if (typeof data.baseAmount === 'number') {
        invoice.baseAmount = data.baseAmount;
        invoice.totalAmountDue = invoice.baseAmount + (invoice.carryOverAmount || 0);
        invoice.balance = Math.max(0, invoice.totalAmountDue - (invoice.amountPaid || 0));

        if (invoice.balance <= 0) invoice.status = 'PAID';
        else if (invoice.amountPaid > 0) invoice.status = 'PARTIAL';
        else invoice.status = 'PENDING';
    }

    if (data.status) {
        invoice.status = data.status;
    }

    const savedInvoice = await invoice.save();
    await exports.syncInvoiceToAdditionalPayments(savedInvoice);

    // If invoice transitions from DRAFT to non-DRAFT, post ledger entries and apply prepayments
    if (oldStatus === 'DRAFT' && savedInvoice.status !== 'DRAFT') {
        try {
            await LedgerService.generateInvoiceLedgerEntries(savedInvoice);
        } catch (ledgerErr) {
            console.error("[InvoiceService] Failed to generate ledger entries on draft issue:", ledgerErr);
        }
        await exports.applyPrepaymentsToInvoice(savedInvoice._id);
    }

    return savedInvoice;
};

exports.deleteInvoice = async (id) => {
    return await deleteInvoiceService(id);
};

exports.deleteAll = async () => {
    return await deleteAllInvoicesService();
};

exports.getGenerationSettings = async () => {
    const SystemSettings = require("../../SystemSettings/Model/SystemSettingsModel");
    const setting = await SystemSettings.findOne({ key: 'invoice_generation_day' });
    return {
        generationDay: setting ? parseInt(setting.value) : 3, // Default Wednesday
    };
};

exports.updateGenerationSettings = async (data) => {
    const SystemSettings = require("../../SystemSettings/Model/SystemSettingsModel");
    const DriverService = require("../../Driver/Service/DriverService");
    const { generationDay } = data;

    await SystemSettings.findOneAndUpdate(
        { key: 'invoice_generation_day' },
        { value: generationDay, description: 'Day of the week to generate invoices (0-6)' },
        { upsert: true, new: true }
    );

    // Trigger dynamic rent plan update for all drivers
    try {
        await DriverService.reconfigureAllPendingRentPlans(generationDay);
    } catch (err) {
        console.error("[InvoiceService] Failed to reconfigure pending rent plans:", err);
    }

    return { success: true };
};

exports.triggerWeeklyGeneration = async (userId, userRole) => {
    const InvoiceCronService = require("./InvoiceCronService");
    return await InvoiceCronService.generateCurrentWeekInvoices(true, userId, userRole);
};

exports.syncInvoiceToAdditionalPayments = async (invoice) => {
    try {
        const mongoose = require("mongoose");
        const Driver = mongoose.model("Driver");
        const driver = await Driver.findOne({
            _id: invoice.driver,
            $or: [
                { "additionalPayments.invoiceNumber": invoice.invoiceNumber },
                { "additionalPayments.invoiceRef": invoice._id }
            ]
        });
        if (!driver) return;

        const paymentItem = driver.additionalPayments.find(p =>
            p.invoiceNumber === invoice.invoiceNumber ||
            (p.invoiceRef && p.invoiceRef.toString() === invoice._id.toString())
        );

        if (paymentItem) {
            paymentItem.amountPaid = invoice.amountPaid || 0;
            paymentItem.balance = invoice.balance;
            paymentItem.status = invoice.status;
            paymentItem.paidAt = invoice.paidAt;

            // Map payments
            paymentItem.payments = (invoice.payments || []).map(p => ({
                amount: p.amount,
                paidAt: p.paidAt,
                paymentMethod: p.paymentMethod || "Cash",
                transactionId: p.transactionId,
                note: p.note
            }));

            driver.markModified("additionalPayments");
            await driver.save();
            console.log(`[InvoiceService] Synced invoice ${invoice.invoiceNumber} status (${invoice.status}) to driver additional payments`);
        }
    } catch (err) {
        console.error("[InvoiceService] Error in syncInvoiceToAdditionalPayments:", err);
    }
};

exports.createLedgerEntryForBulkUpload = async (amount, paymentMethod, invoice, createdBy, creatorRole, note, accountCode) => {
    try {
        console.log(`[InvoiceService] Starting bulk ledger generation for invoice payment ${invoice.invoiceNumber}`);
        const mongoose = require("mongoose");
        const AccountingCode = require("../../AccountingCode/Model/AccountingCodeModel");
        const PaymentTransaction = require("../../Payment/Model/PaymentTransactionModel");
        const LedgerService = require("../../Ledger/Service/LedgerService");
        
        // Find sales account code "IN0002" (or fallback/use 4100)
        const accCode = await AccountingCode.findOne({ code: "IN0002" }) || await AccountingCode.findOne({ code: "4100" });
        console.log(`[InvoiceService] AccountingCode found: ${accCode ? accCode.code : 'none'}`);

        if (accCode) {
            let normalizedMethod = "OTHER";
            const methodUpper = paymentMethod ? paymentMethod.toUpperCase() : "CASH";

            if (methodUpper.includes("CASH")) normalizedMethod = "CASH";
            else if (methodUpper.includes("BANK") || methodUpper.includes("TRANSFER")) normalizedMethod = "BANK_TRANSFER";
            else if (methodUpper.includes("CARD")) normalizedMethod = "CREDIT_CARD";
            else if (methodUpper.includes("CHEQUE")) normalizedMethod = "CHEQUE";

            const transactionData = {
                accountingCode: accCode._id,
                referenceId: invoice.driver,
                referenceModel: "Driver",
                transactionCategory: "INCOME",
                transactionType: "CREDIT",
                isTaxInclusive: false,
                baseAmount: amount,
                totalAmount: amount,
                paymentMethod: normalizedMethod,
                status: "COMPLETED",
                paymentDate: invoice.dueDate || new Date(),
                notes: `Invoice Payment (${invoice.invoiceNumber})${note ? ' - ' + note : ''}`,
                createdBy,
                creatorRole
            };

            console.log(`[InvoiceService] Creating PaymentTransaction for amount ${amount}`);
            const newTransaction = await PaymentTransaction.create(transactionData);
            console.log(`[InvoiceService] PaymentTransaction created: ${newTransaction._id}`);

            // Fetch driver details to get the branch
            const { Driver } = require("../../Driver/Model/DriverModel");
            const driverDoc = await Driver.findById(invoice.driver);
            const branchId = invoice.branch || (driverDoc ? driverDoc.branch : undefined);

            // Fetch custom cash/bank account if code was provided, but prioritize code "1010" first
            let cashBankAccount = await AccountingCode.findOne({ code: "1010", category: "ASSET" });
            if (cashBankAccount) {
                console.log(`[InvoiceService] Found preferred Bank Account with code 1010`);
            }

            if (!cashBankAccount && accountCode) {
                cashBankAccount = await AccountingCode.findOne({ code: accountCode.toString().trim(), category: "ASSET" });
                if (cashBankAccount) {
                    console.log(`[InvoiceService] Found custom bank/cash account matching code: ${accountCode}`);
                }
            }
            // Fallback if not found or not provided
            if (!cashBankAccount) {
                cashBankAccount = await AccountingCode.findOne({ category: "ASSET", code: { $nin: ["1100", "1200"] } });
                if (!cashBankAccount) {
                    cashBankAccount = await AccountingCode.findOne({ code: "1100" }) || await AccountingCode.findOne({ code: "1200" });
                }
            }

            let prDoc = null;

            // Zoho Accounting Integration: Auto-create PaymentReceived record
            try {
                const PaymentReceived = require("../../PaymentReceived/Model/PaymentReceivedModel");

                const methodUpper2 = (paymentMethod || "").toUpperCase();
                let normalizedPRMethod = "Other";
                if (methodUpper2.includes("CASH")) normalizedPRMethod = "Cash";
                else if (methodUpper2.includes("BANK") || methodUpper2.includes("TRANSFER") || methodUpper2.includes("WIRE")) normalizedPRMethod = "Bank Transfer";
                else if (methodUpper2.includes("CARD") || methodUpper2.includes("POS")) normalizedPRMethod = "Card";
                else if (methodUpper2.includes("MOBILE") || methodUpper2.includes("MONEY")) normalizedPRMethod = "Mobile Money";

                const prData = {
                    paymentNumber: `PR-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`, // unique suffix
                    driverId: invoice.driver,
                    amountReceived: amount,
                    paymentDate: invoice.dueDate || new Date(),
                    paymentMethod: normalizedPRMethod,
                    notes: `Invoice Payment (${invoice.invoiceNumber})${note ? ' - ' + note : ''}`,
                    depositedTo: cashBankAccount ? cashBankAccount._id : undefined,
                    branch: branchId,
                    invoices: [{
                        invoiceId: invoice._id,
                        invoiceNumber: invoice.invoiceNumber,
                        amountApplied: amount
                    }],
                    status: "COMPLETED"
                };
                prDoc = await PaymentReceived.create(prData);
                console.log(`[InvoiceService] PaymentReceived record created successfully: ${prDoc.paymentNumber}`);
            } catch (prErr) {
                console.error("[InvoiceService] Failed to auto-create PaymentReceived record:", prErr);
            }

            if (cashBankAccount) {
                // Create a PaymentTransaction referencing the PaymentReceived record
                const prTransactionData = {
                    accountingCode: cashBankAccount._id,
                    referenceId: prDoc ? prDoc._id : invoice.driver,
                    referenceModel: prDoc ? "PaymentReceived" : "Driver",
                    transactionCategory: "ASSET",
                    transactionType: "DEBIT",
                    isTaxInclusive: false,
                    baseAmount: amount,
                    totalAmount: amount,
                    paymentMethod: normalizedMethod,
                    status: "COMPLETED",
                    paymentDate: invoice.dueDate || new Date(),
                    notes: `Invoice Payment (${invoice.invoiceNumber})${note ? ' - ' + note : ''}`,
                    createdBy,
                    creatorRole
                };
                
                console.log(`[InvoiceService] Creating Debit PaymentTransaction for amount ${amount}`);
                const prNewTransaction = await PaymentTransaction.create(prTransactionData);
                console.log(`[InvoiceService] Debit PaymentTransaction created: ${prNewTransaction._id}`);
                
                const prPopulatedTx = { ...prNewTransaction.toObject(), accountingCode: cashBankAccount };
                await LedgerService.autoGenerateLedgerEntry(prPopulatedTx);
                console.log(`[InvoiceService] Ledger entry generation triggered for ${prNewTransaction._id}`);
            }
        } else {
            console.error("[InvoiceService] No Asset account found to debit for invoice payment.");
        }
    } catch (err) {
        console.error("[InvoiceService] Failed to generate ledger for invoice payment:", err);
    }
};

exports.bulkUploadInvoices = async (rows, invoiceType, createdBy, creatorRole) => {
    const { Invoice } = require("../Model/InvoiceModel");
    const { Driver } = require("../../Driver/Model/DriverModel");
    const LedgerService = require("../../Ledger/Service/LedgerService");
    const Tax = require("../../Tax/Model/TaxModel");

    const activeTax = await Tax.findOne({ isActive: true, isDeleted: false });
    const defaultTaxRate = activeTax ? activeTax.rate : 0;
    const startSeq = await exports.getNextInvoiceNumberVal();

    // 1. Fetch all drivers into memory for fast map-based lookups
    const driversList = await Driver.find({ isDeleted: false });
    const driversByName = new Map();
    const driversById = new Map();
    for (const d of driversList) {
        if (d.personalInfo && d.personalInfo.fullName) {
            const cleanName = d.personalInfo.fullName.trim().toLowerCase().replace(/\s+/g, ' ');
            driversByName.set(cleanName, d);
        }
        if (d.driverId) {
            driversById.set(d.driverId.trim().toLowerCase(), d);
        }
    }

    const createdInvoices = [];
    const errors = [];

    // Helper to get normalized value from row with whitespace & case-insensitive matching
    const getRowVal = (r, possibleKeys) => {
        for (const key of possibleKeys) {
            const cleanKey = key.replace(/^\ufeff/, '').trim().toLowerCase();
            if (r[key] !== undefined) return r[key];
            for (const k of Object.keys(r)) {
                const cleanK = k.replace(/^\ufeff/, '').trim().toLowerCase();
                if (cleanK === cleanKey) {
                    return r[k];
                }
            }
        }
        return undefined;
    };

    // Helper to parse flexible dates
    const parseFlexibleDate = (dateStr) => {
        if (!dateStr) return null;
        if (dateStr instanceof Date) return isNaN(dateStr.getTime()) ? null : dateStr;
        if (typeof dateStr === 'number') {
            const date = new Date((dateStr - 25569) * 86400 * 1000);
            return isNaN(date.getTime()) ? null : date;
        }
        const str = dateStr.toString().trim();
        if (!str) return null;
        const dmyRegex = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/;
        const match = str.match(dmyRegex);
        if (match) {
            const day = parseInt(match[1], 10);
            const month = parseInt(match[2], 10) - 1;
            const year = parseInt(match[3], 10);
            const date = new Date(year, month, day);
            if (date.getFullYear() === year && date.getMonth() === month && date.getDate() === day) {
                return date;
            }
        }
        const parsedDate = new Date(str);
        return isNaN(parsedDate.getTime()) ? null : parsedDate;
    };

    // 2. Group uploaded rows by "Invoice Number" (or "Invoice ID") to handle multi-line items
    const invoiceGroups = new Map();
    let rowCounter = 0;
    for (const row of rows) {
        rowCounter++;
        const invNo = getRowVal(row, ["Invoice Number", "invoiceNumber"]);
        const invId = getRowVal(row, ["Invoice ID", "invoiceId"]);
        const key = (invNo || invId || `TEMP-${Date.now()}-${rowCounter}`).toString().trim();
        if (!invoiceGroups.has(key)) {
            invoiceGroups.set(key, []);
        }
        invoiceGroups.get(key).push({ row, originalIndex: rowCounter });
    }

    let invoiceIndex = 0;
    for (const [key, grouped] of invoiceGroups.entries()) {
        const headerRowObj = grouped[0];
        const headerRow = headerRowObj.row;
        const origIdx = headerRowObj.originalIndex;

        // Lookup Driver
        const customerIdVal = getRowVal(headerRow, ["Customer ID", "customerId", "driver id", "driverId"]);
        const customerNameVal = getRowVal(headerRow, ["Customer Name", "customerName", "fullName", "driver name", "driverName", "customer", "driver"]);

        const customerIdInput = (customerIdVal || "").toString().trim().toLowerCase();
        const customerNameInput = (customerNameVal || "").toString().trim().toLowerCase().replace(/\s+/g, ' ');

        let driver = null;
        if (customerIdInput) {
            driver = driversById.get(customerIdInput);
        }
        if (!driver && customerNameInput) {
            // Try exact match first
            driver = driversByName.get(customerNameInput);
            
            // If not found, try flexible matching (substring)
            if (!driver) {
                for (const [dbName, dbDriver] of driversByName.entries()) {
                    if (dbName.includes(customerNameInput) || customerNameInput.includes(dbName)) {
                        driver = dbDriver;
                        break;
                    }
                }
            }
        }

        if (!driver) {
            errors.push(`Invoice group "${key}" (Row ${origIdx}): Driver not found for Customer ID "${customerIdVal || ''}" or Customer Name "${customerNameVal || ''}"`);
            continue;
        }

        // Validate invoice duplicates - overwrite/replace if duplicate exists (user specified no need to block on invoice number validation)
        const invNo = (getRowVal(headerRow, ["Invoice Number", "invoiceNumber"]) || "").toString().trim();
        const invoiceNumber = invNo || exports.formatInvoiceNumber(startSeq + invoiceIndex);
        invoiceIndex++;

        if (invNo) {
            const existingInv = await Invoice.findOne({ invoiceNumber, isDeleted: false });
            if (existingInv) {
                console.log(`[InvoiceService] Overwriting duplicate invoice ${invoiceNumber} by deleting the old one.`);
                await Invoice.deleteOne({ _id: existingInv._id });
                
                // Clean up corresponding ledger entries
                const LedgerEntry = require("../../Ledger/Model/LedgerEntryModel");
                await LedgerEntry.deleteMany({ referenceId: existingInv._id });
                
                // Clean up corresponding PaymentReceived document if any
                const PaymentReceived = require("../../PaymentReceived/Model/PaymentReceivedModel");
                await PaymentReceived.deleteMany({ "invoices.invoiceId": existingInv._id });
            }
        }

        // Parse line items
        const lineItems = [];
        let calculatedSubtotal = 0;
        let calculatedTaxAmount = 0;
        let itemTaxRate = defaultTaxRate;

        for (const itemObj of grouped) {
            const r = itemObj.row;
            const itemName = getRowVal(r, ["Item Name", "itemName"]);
            if (!itemName) continue;

            const qty = Number(getRowVal(r, ["Quantity", "quantity"])) || 1;
            const unitPrice = Number(getRowVal(r, ["Item Price", "itemPrice"])) || 0;
            const itemTotal = Number(getRowVal(r, ["Item Total", "itemTotal"])) || (qty * unitPrice);

            // Calculate tax
            let taxPct = defaultTaxRate;
            const itemTaxPctVal = getRowVal(r, ["Item Tax %", "itemTaxPct", "taxRate"]);
            if (itemTaxPctVal !== undefined && itemTaxPctVal !== "") {
                taxPct = Number(itemTaxPctVal);
                // If it's a decimal like 0.16 instead of 16, convert it
                if (taxPct > 0 && taxPct < 1) {
                    taxPct = taxPct * 100;
                }
            }
            itemTaxRate = taxPct;

            const itemTaxAmtVal = getRowVal(r, ["Item Tax Amount", "itemTaxAmount", "taxAmount"]);
            const taxAmt = Number(itemTaxAmtVal) || (itemTotal * (taxPct / 100));

            lineItems.push({
                name: itemName,
                description: getRowVal(r, ["Item Desc", "itemDesc"]) || "",
                qty,
                unitPrice,
                total: itemTotal
            });

            calculatedSubtotal += itemTotal;
            calculatedTaxAmount += taxAmt;
        }

        // Fallback if no item details were parsed
        if (lineItems.length === 0) {
            const baseAmount = Number(getRowVal(headerRow, ["SubTotal", "subtotal", "amount"])) || 0;
            lineItems.push({
                name: getRowVal(headerRow, ["Item Name", "itemName"]) || getRowVal(headerRow, ["description"]) || "Manual Billing",
                qty: 1,
                unitPrice: baseAmount,
                total: baseAmount
            });
            calculatedSubtotal = baseAmount;
            
            let taxPct = defaultTaxRate;
            const itemTaxPctVal = getRowVal(headerRow, ["Item Tax %", "itemTaxPct", "taxRate"]);
            if (itemTaxPctVal !== undefined && itemTaxPctVal !== "") {
                taxPct = Number(itemTaxPctVal);
                if (taxPct > 0 && taxPct < 1) taxPct = taxPct * 100;
            }
            itemTaxRate = taxPct;
            
            const itemTaxAmtVal = getRowVal(headerRow, ["Item Tax Amount", "itemTaxAmount", "taxAmount"]);
            calculatedTaxAmount = Number(itemTaxAmtVal) || (baseAmount * (taxPct / 100));
        }

        // Subtotal, Discount & Tax calculations at Invoice level
        const discountType = getRowVal(headerRow, ["Discount Type", "discountType"]) === "Percentage" ? "PERCENTAGE" : "FIXED";
        const discountValue = Number(getRowVal(headerRow, ["Discount", "discount"])) || 0;
        const discountAmount = Number(getRowVal(headerRow, ["Discount Amount", "discountAmount", "Entity Discount Amount"])) || 0;

        const subtotal = Number(getRowVal(headerRow, ["SubTotal", "subtotal"])) || calculatedSubtotal;
        const taxAmount = Number(getRowVal(headerRow, ["Item Tax Amount", "itemTaxAmount", "taxAmount"])) || calculatedTaxAmount;
        const totalAmountDue = Number(getRowVal(headerRow, ["Total", "total"])) || (subtotal - discountAmount + taxAmount);
        const balance = Number(getRowVal(headerRow, ["Balance", "balance"])) || 0;

        // Map status: Closed -> PAID, Overdue -> OVERDUE, Draft -> DRAFT, Cancelled/Rejected -> CANCELLED, Pending -> PENDING
        const rawStatus = (getRowVal(headerRow, ["Invoice Status", "status"]) || "PENDING").toString().trim().toUpperCase();
        let status = "PENDING";
        if (rawStatus === "CLOSED" || rawStatus === "PAID") {
            status = "PAID";
        } else if (rawStatus === "OVERDUE") {
            status = "OVERDUE";
        } else if (rawStatus === "DRAFT") {
            status = "DRAFT";
        } else if (rawStatus === "CANCELLED" || rawStatus === "REJECTED") {
            status = "CANCELLED";
        }

        const amountPaid = status === "PAID" ? totalAmountDue : Math.max(0, totalAmountDue - balance);
        const finalBalance = status === "PAID" ? 0 : balance;

        // Map Notes: Invoice ID and Tax ID are separately recorded in note field
        const notesList = [];
        const rawNotes = getRowVal(headerRow, ["Notes", "notes"]);
        if (rawNotes) {
            notesList.push(rawNotes);
        }
        const rawInvoiceId = getRowVal(headerRow, ["Invoice ID", "invoiceId"]);
        if (rawInvoiceId) {
            notesList.push(`Invoice ID: ${rawInvoiceId}`);
        }
        const rawTaxId = getRowVal(headerRow, ["Tax ID", "taxId"]);
        if (rawTaxId) {
            notesList.push(`Tax ID: ${rawTaxId}`);
        }
        const finalNotes = notesList.join("\n");

        // Format dates
        const dueDate = parseFlexibleDate(getRowVal(headerRow, ["Due Date", "dueDate"])) || new Date();
        const generatedAt = parseFlexibleDate(getRowVal(headerRow, ["Invoice Date", "invoiceDate"])) || new Date();

        const payments = [];
        let paidAt = undefined;
        if (status === "PAID") {
            payments.push({
                amount: totalAmountDue,
                paidAt: dueDate,
                paymentMethod: "Bank Transfer", // User requested all payment methods to be Bank Transfer on bulk upload
                note: "Bulk upload payment"
            });
            paidAt = dueDate;
        }

        const newInvoiceData = {
            invoiceNumber,
            invoiceType: "MANUAL",
            driver: driver._id,
            vehicle: driver.currentVehicle || undefined,
            dueDate,
            generatedAt,
            baseAmount: subtotal - discountAmount,
            tax: activeTax ? activeTax._id : undefined,
            taxRate: itemTaxRate,
            taxAmount,
            totalAmountDue,
            amountPaid,
            balance: finalBalance,
            status,
            paidAt,
            payments,
            lineItems,
            subtotal,
            discountType,
            discountValue,
            discountAmount,
            notes: finalNotes,
            createdBy,
            creatorRole
        };

        try {
            const created = await Invoice.create(newInvoiceData);
            createdInvoices.push(created);

            // Post General Ledger entries
            try {
                if (status !== "DRAFT") {
                    await LedgerService.generateInvoiceLedgerEntries(created);
                    
                    // For CLOSED (PAID) invoices, post corresponding payments and auto-create PaymentReceived
                    if (status === "PAID") {
                        const accountCode = getRowVal(headerRow, ["Account Code", "accountCode"]);
                        const paymentMethod = "Bank Transfer"; // User requested all payment methods to be Bank Transfer on bulk upload
                        await exports.createLedgerEntryForBulkUpload(
                            totalAmountDue,
                            paymentMethod,
                            created,
                            createdBy,
                            creatorRole,
                            "Bulk upload payment received",
                            accountCode
                        );
                    }
                }
            } catch (ledgerErr) {
                console.error(`[InvoiceService] Failed ledger generation for bulk invoice ${invoiceNumber}:`, ledgerErr);
            }
        } catch (err) {
            errors.push(`Invoice group "${key}" (Row ${origIdx}): Failed to create invoice - ${err.message}`);
        }
    }

    return {
        successCount: createdInvoices.length,
        errorCount: errors.length,
        errors,
        createdInvoices: createdInvoices.map(inv => inv.invoiceNumber)
    };
};

exports.recalculateInvoicesForTax = async (taxId, newRate) => {
    const { Invoice } = require("../Model/InvoiceModel");
    const LedgerService = require("../../Ledger/Service/LedgerService");
    const LedgerEntry = require("../../Ledger/Model/LedgerEntryModel");

    const openInvoices = await Invoice.find({
        tax: taxId,
        status: { $in: ["PENDING", "PARTIAL", "DRAFT"] },
        isDeleted: false
    });

    console.log(`[InvoiceService] Recalculating tax for ${openInvoices.length} open invoices linked to tax ${taxId} with new rate ${newRate}%`);

    for (const invoice of openInvoices) {
        const subtotal = invoice.subtotal || invoice.baseAmount;
        const discountAmount = invoice.discountAmount || 0;
        const afterDiscount = subtotal - discountAmount;
        const newTaxAmount = newRate > 0 ? Math.round((afterDiscount * newRate / 100) * 100) / 100 : 0;
        const newTotalDue = Math.round((afterDiscount + newTaxAmount + invoice.carryOverAmount) * 100) / 100;
        const newBalance = Math.max(0, newTotalDue - invoice.amountPaid);
        
        let newStatus = invoice.status;
        if (newStatus !== 'DRAFT') {
            if (newBalance <= 0) newStatus = 'PAID';
            else if (invoice.amountPaid > 0) newStatus = 'PARTIAL';
            else newStatus = 'PENDING';
        }

        invoice.taxRate = newRate;
        invoice.taxAmount = newTaxAmount;
        invoice.totalAmountDue = newTotalDue;
        invoice.balance = newBalance;
        invoice.status = newStatus;

        await invoice.save();

        if (newStatus !== 'DRAFT') {
            try {
                // Delete old ledger entries matching this invoice number
                await LedgerEntry.deleteMany({
                    description: new RegExp(`\\(INV:\\s*${invoice.invoiceNumber}\\)`)
                });
                // Post new ledger entries with the recalculated totals
                await LedgerService.generateInvoiceLedgerEntries(invoice);
                console.log(`[InvoiceService] Successfully updated ledger entries for invoice ${invoice.invoiceNumber} with new total amount due ${newTotalDue}`);
            } catch (ledgerErr) {
                console.error(`[InvoiceService] Failed to regenerate ledger entries for invoice ${invoice.invoiceNumber} during tax recalculation:`, ledgerErr);
            }
        }
    }
};

