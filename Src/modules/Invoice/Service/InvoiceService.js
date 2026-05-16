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

    const invoicesData = [];
    const ts = Date.now();
    
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
        invoicesData.push({
            invoiceNumber: `INV-${ts}-${periodNum}`,
            driver: driverId,
            vehicle: vehicleId,
            weekNumber: periodNum,
            weekLabel: isWeekly 
                ? `Week ${periodNum} - ${dueDate.toLocaleDateString('en-US', { day: 'numeric', month: 'short' })}`
                : `Month ${periodNum} - ${dueDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`,
            dueDate: dueDate,
            baseAmount: amount,
            carryOverAmount: 0,
            totalAmountDue: amount,
            amountPaid: 0,
            balance: amount,
            status: "PENDING",
            payments: [],
            createdBy,
            creatorRole
        });
    }

    return await addManyInvoicesService(invoicesData, session);
};

exports.payInvoice = async (invoiceId, paymentData) => {
    const { amount, paymentMethod, transactionId, note, createdBy, creatorRole } = paymentData;
    if (!amount || amount <= 0) throw new Error("Payment amount must be greater than 0");

    const invoice = await Invoice.findById(invoiceId);
    if (!invoice || invoice.isDeleted) throw new Error("Invoice not found");
    if (invoice.status === "PAID") throw new Error("Invoice is already fully paid");

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
         await Invoice.findByIdAndUpdate(nextInv._id, upd);
         rem -= toPay;
     }
}

exports.rolloverDriverInvoices = async (driverId) => {
    // Read all invoices sorted by week
    const invoices = await Invoice.find({ driver: driverId, isDeleted: false }).sort({ weekNumber: 1 });
    
    let totalCarryOver = 0;
    const today = new Date();
    today.setHours(0,0,0,0);

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
        console.log(`[InvoiceService] Starting ledger generation for invoice ${invoice.invoiceNumber}`);
        const AccountingCode = require("../../AccountingCode/Model/AccountingCodeModel");
        const accCode = await AccountingCode.findOne({ code: "4100" });
        console.log(`[InvoiceService] AccountingCode 4100 found: ${!!accCode}`);
        
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
            await LedgerService.autoGenerateLedgerEntry(populatedTx);
            console.log(`[InvoiceService] Ledger entry generation triggered for ${newTransaction._id}`);

            // Zoho Accounting Integration: Auto-create PaymentReceived record
            try {
                const PaymentReceived = require("../../PaymentReceived/Model/PaymentReceivedModel");

                // Normalize paymentMethod to match PaymentReceived schema enum:
                // ["Cash", "Bank Transfer", "Card", "Mobile Money", "Other"]
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
                    invoices: [{
                        invoiceId: invoice._id,
                        invoiceNumber: invoice.invoiceNumber,
                        amountApplied: amount
                    }],
                    status: "COMPLETED"
                };
                const prDoc = await PaymentReceived.create(prData);
                console.log(`[InvoiceService] PaymentReceived record created successfully: ${prDoc.paymentNumber}`);
            } catch (prErr) {
                console.error("[InvoiceService] Failed to auto-create PaymentReceived record:", prErr);
            }
        }
    } catch (err) {
        console.error("[InvoiceService] Failed to generate ledger for invoice payment:", err);
    }
};

exports.createManualInvoice = async (data, createdBy, creatorRole) => {
    const { 
        driver: driverId, vehicle: vehicleId, weekLabel, dueDate, invoiceDate,
        lineItems = [], discountType = 'PERCENTAGE', discountValue = 0, 
        taxRate = 0, notes 
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
    
    // Compute tax
    const taxAmount = taxRate > 0 ? Math.round((afterDiscount * taxRate / 100) * 100) / 100 : 0;
    const totalAmountDue = Math.round((afterDiscount + taxAmount) * 100) / 100;

    // Auto-assign weekNumber (next available for this driver)
    const existingInvoices = await Invoice.find({ driver: driverId, isDeleted: false }).sort({ weekNumber: -1 }).limit(1);
    const nextWeekNumber = existingInvoices.length > 0 ? (existingInvoices[0].weekNumber + 1) : 1;

    // Generate manual invoice number
    const ts = Date.now();
    const invoiceNumber = `MAN-${ts}`;

    const invoiceData = {
        invoiceNumber,
        driver: driverId,
        vehicle: vehicleId || undefined,
        weekNumber: nextWeekNumber,
        weekLabel: weekLabel || `Manual Invoice - ${new Date(dueDate).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })}`,
        dueDate: new Date(dueDate),
        generatedAt: invoiceDate ? new Date(invoiceDate) : new Date(),
        baseAmount: totalAmountDue,
        carryOverAmount: 0,
        totalAmountDue,
        amountPaid: 0,
        balance: totalAmountDue,
        status: 'PENDING',
        payments: [],
        // Manual invoice specific fields
        invoiceType: 'MANUAL',
        lineItems: enrichedLineItems,
        subtotal,
        discountType,
        discountValue: Number(discountValue),
        discountAmount,
        taxRate: Number(taxRate),
        taxAmount,
        notes: notes || '',
        createdBy,
        creatorRole,
    };

    const newInvoice = await Invoice.create(invoiceData);
    return await Invoice.findById(newInvoice._id).populate('driver', 'personalInfo driverId').populate('vehicle', 'plateNumber make model');
};

exports.updateInvoice = async (id, data) => {
    const { Invoice } = require("../Model/InvoiceModel");
    const invoice = await Invoice.findById(id);
    if (!invoice) throw new Error("Invoice not found");
    if (invoice.status === 'PAID') throw new Error("Cannot edit a fully paid invoice");

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

    return await invoice.save();
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
    const { generationDay } = data;
    await SystemSettings.findOneAndUpdate(
        { key: 'invoice_generation_day' },
        { value: generationDay, description: 'Day of the week to generate invoices (0-6)' },
        { upsert: true, new: true }
    );
    return { success: true };
};

exports.triggerWeeklyGeneration = async (userId, userRole) => {
    const InvoiceCronService = require("./InvoiceCronService");
    return await InvoiceCronService.generateCurrentWeekInvoices(true, userId, userRole);
};
