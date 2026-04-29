const { 
    addManyInvoicesService, 
    getInvoicesService, 
    getInvoiceByIdService, 
    updateInvoiceService 
} = require("../Repo/InvoiceRepo");
const { Invoice } = require("../Model/InvoiceModel");
const PaymentTransaction = require("../../Payment/Model/PaymentTransactionModel");
const LedgerService = require("../../Ledger/Service/LedgerService");
const { Vehicle } = require("../../Vehicle/Model/VehicleModel");
const { Driver } = require("../../Driver/Model/DriverModel");

exports.getAll = async (queryParams = {}, options = {}) => {
    return await getInvoicesService(queryParams, options);
};

exports.getById = async (id) => {
    return await getInvoiceByIdService(id);
};

exports.generateRentInvoices = async (driverId, vehicleId, weeklyRent, durationWeeks, startFromNextWeek = true, createdBy, creatorRole, session = null) => {
    const startDate = new Date();
    if (startFromNextWeek) {
        startDate.setDate(startDate.getDate() + 7);
    }
    startDate.setHours(0, 0, 0, 0);

    const invoicesData = [];
    const ts = Date.now();
    for (let i = 0; i < durationWeeks; i++) {
        const dueDate = new Date(startDate.getTime() + (i * 7 * 24 * 60 * 60 * 1000));
        const weekNum = i + 1;
        
        invoicesData.push({
            invoiceNumber: `INV-${ts}-${weekNum}`,
            driver: driverId,
            vehicle: vehicleId,
            weekNumber: weekNum,
            weekLabel: `Week ${weekNum} - ${dueDate.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' })}`,
            dueDate: dueDate,
            baseAmount: weeklyRent,
            carryOverAmount: 0,
            totalAmountDue: weeklyRent,
            amountPaid: 0,
            balance: weeklyRent,
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
        amountPaid: newPaid,
        balance: newBalance,
        status: newStatus,
        $push: { payments: paymentRecord }
    };
    if (newStatus === "PAID" && !invoice.paidAt) {
        updateData.paidAt = timestamp;
    }

    const updatedInvoice = await Invoice.findByIdAndUpdate(invoiceId, updateData, { new: true });

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
        }
    } catch (err) {
        console.error("[InvoiceService] Failed to generate ledger for invoice payment:", err);
    }
};
