const CreditNote = require("../Model/CreditNoteModel");
const { Invoice } = require("../../Invoice/Model/InvoiceModel");
const { Driver } = require("../../Driver/Model/DriverModel");
const PaymentTransaction = require("../../Payment/Model/PaymentTransactionModel");
const AccountingCode = require("../../AccountingCode/Model/AccountingCodeModel");
const LedgerService = require("../../Ledger/Service/LedgerService");

/**
 * Creates a new Credit Note and processes adjustments.
 */
const createCreditNote = async (data, actor) => {
    const { driverId, invoiceId, amount, reason, notes, creditNoteDate } = data;

    if (!driverId || !amount || !reason) {
        throw new Error("Missing required Credit Note fields: driverId, amount, and reason are mandatory.");
    }

    if (Number(amount) <= 0) {
        throw new Error("Credit Note amount must be greater than 0.");
    }

    const driver = await Driver.findById(driverId);
    if (!driver) {
        throw new Error("Driver not found.");
    }

    const creditNoteNumber = `CN-${Date.now()}`;

    // 1. Create the Credit Note Record directly in OPEN status (without applying yet)
    const creditNoteDoc = await CreditNote.create({
        creditNoteNumber,
        driverId,
        invoiceId: invoiceId || undefined,
        amount,
        reason,
        notes,
        creditNoteDate: creditNoteDate || new Date(),
        status: 'OPEN',
        createdBy: actor.id || actor._id,
        creatorRole: actor.role
    });

    // 2. Create PaymentTransaction & Ledger entry for Zoho accounting immediately on issuance
    try {
        // Search for code 4200 (seeded earlier). Fallback to 4100.
        let accCode = await AccountingCode.findOne({ code: "4200" });
        if (!accCode) {
            accCode = await AccountingCode.findOne({ code: "4100" });
        }

        if (accCode) {
            const driverName = driver.personalInfo?.fullName || "Driver";
            const txNote = `Credit Note [${creditNoteNumber}]: ${reason} for ${driverName}${notes ? ' - ' + notes : ''}`;

            // FIX: Bind explicitly to Driver Model so it registers under Driver Ledger Accounts!
            const transactionData = {
                accountingCode: accCode._id,
                referenceId: driverId, 
                referenceModel: "Driver",
                transactionCategory: "INCOME",
                transactionType: "DEBIT", // Reduces the driver receivable account
                isTaxInclusive: false,
                baseAmount: amount,
                totalAmount: amount,
                paymentMethod: "OTHER",
                status: "COMPLETED",
                paymentDate: new Date(),
                notes: txNote,
                createdBy: actor.id || actor._id,
                creatorRole: actor.role
            };

            const newTransaction = await PaymentTransaction.create(transactionData);
            const populatedTx = { ...newTransaction.toObject(), accountingCode: accCode };
            await LedgerService.autoGenerateLedgerEntry(populatedTx);
            console.log(`[CreditNoteService] Generated ledger reversal linked to Driver: ${creditNoteNumber}`);
        }
    } catch (err) {
        console.error("[CreditNoteService] Failed to generate ledger record for Credit Note:", err.message);
    }

    return creditNoteDoc;
};

/**
 * Explicitly applies an existing OPEN Credit Note to a specific target Invoice.
 */
const applyCreditNoteToInvoice = async (id, invoiceId) => {
    const creditNote = await CreditNote.findById(id);
    if (!creditNote) {
        throw new Error("Credit Note not found.");
    }

    if (!['OPEN', 'DRAFT'].includes(creditNote.status)) {
        throw new Error("Only OPEN or DRAFT credit notes can be applied to invoices.");
    }

    const invoice = await Invoice.findById(invoiceId);
    if (!invoice) {
        throw new Error("Invoice not found.");
    }
    
    if (invoice.status === 'PAID') {
        throw new Error("Cannot apply credit to a fully paid invoice.");
    }

    // Ensure credit note driver matches invoice driver
    const invDriverId = typeof invoice.driver === 'object' ? invoice.driver._id.toString() : invoice.driver.toString();
    if (creditNote.driverId.toString() !== invDriverId) {
        throw new Error("Operational mismatch: Credit Note operator does not match Invoice operator.");
    }

    // Cap application at invoice's remaining balance
    const appliedAmount = Math.min(creditNote.amount, invoice.balance);
    const newAmountPaid = (invoice.amountPaid || 0) + appliedAmount;
    const newBalance = Math.max(0, invoice.balance - appliedAmount);
    
    let newStatus = invoice.status;
    if (newBalance <= 0) {
        newStatus = 'PAID';
    } else if (newAmountPaid > 0) {
        newStatus = 'PARTIAL';
    }
    
    // New payment entry using only valid enum values
    const newPaymentEntry = {
        amount: appliedAmount,
        paidAt: new Date(),
        paymentMethod: "Other",   // always a valid enum value
        note: `Credit Note Applied (${creditNote.creditNoteNumber})`
    };

    // Use findByIdAndUpdate with runValidators:false to skip re-validating
    // existing payments that may contain legacy non-enum paymentMethod values
    await Invoice.findByIdAndUpdate(
        invoiceId,
        {
            $set: {
                amountPaid: newAmountPaid,
                balance: newBalance,
                status: newStatus
            },
            $push: { payments: newPaymentEntry }
        },
        { runValidators: false }
    );
    
    // Trigger carry-over dynamic balance rollovers
    try {
        const InvoiceService = require("../../Invoice/Service/InvoiceService");
        await InvoiceService.rolloverDriverInvoices(invoice.driver);
    } catch (rollErr) {
        console.error("[CreditNoteService] Carry-over rollover failed during application:", rollErr.message);
    }

    // Link invoice to Credit Note and CLOSE it (also bypass full-doc validation)
    const closedNote = await CreditNote.findByIdAndUpdate(
        id,
        { $set: { invoiceId, status: 'CLOSED' } },
        { new: true, runValidators: false }
    );

    console.log(`[CreditNoteService] Successfully applied $${appliedAmount} from CN ${creditNote.creditNoteNumber} to Invoice ${invoice.invoiceNumber}.`);
    return closedNote;
};


/**
 * Fetch all Credit Notes with pagination and lookup populations.
 */
const getCreditNotes = async (query = {}, pagination = { page: 1, limit: 10 }) => {
    const page = Number(pagination.page) || 1;
    const limit = Number(pagination.limit) || 10;
    const skip = (page - 1) * limit;

    const filter = { ...query };
    
    if (pagination.search) {
        const searchRegex = { $regex: pagination.search, $options: 'i' };
        
        // Find matching drivers
        const { Driver } = require("../../Driver/Model/DriverModel");
        const drivers = await Driver.find({
            $or: [
                { "personalInfo.fullName": searchRegex },
                { "driverId": searchRegex }
            ]
        }).select('_id');
        const driverIds = drivers.map(d => d._id);

        filter.$or = [
            { creditNoteNumber: searchRegex },
            { reason: searchRegex },
            { notes: searchRegex },
            { driverId: { $in: driverIds } }
        ];
    }

    const count = await CreditNote.countDocuments(filter);
    
    let sort = { createdAt: -1 };
    if (pagination.sortBy) {
        sort = { [pagination.sortBy]: pagination.sortOrder === 'desc' ? -1 : 1 };
    }

    const items = await CreditNote.find(filter)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .populate({
            path: 'driverId',
            select: 'driverId personalInfo identityDocs'
        })
        .populate({
            path: 'invoiceId',
            select: 'invoiceNumber weekLabel totalAmountDue balance status'
        });

    return {
        data: items,
        total: count,
        page,
        pages: Math.ceil(count / limit)
    };
};

/**
 * Fetch a single Credit Note by ID.
 */
const getCreditNoteById = async (id) => {
    return await CreditNote.findById(id)
        .populate({
            path: 'driverId',
            select: 'driverId personalInfo branch currentVehicle'
        })
        .populate('invoiceId');
};

/**
 * Voids an existing Credit Note and reverses impacts if applicable.
 */
const voidCreditNote = async (id) => {
    const creditNote = await CreditNote.findById(id);
    if (!creditNote) {
        throw new Error("Credit Note not found.");
    }

    if (creditNote.status === 'VOID') {
        throw new Error("Credit Note is already voided.");
    }

    // Reverse invoice impacts if applicable
    if (creditNote.invoiceId && creditNote.status === 'CLOSED') {
        const invoice = await Invoice.findById(creditNote.invoiceId);
        if (invoice) {
            // Note: Be careful here, reverse amount up to what was actually applied originally.
            // Since appliedAmount wasn't saved separately in schema, we use the note's total amount
            // but we must cap it properly to ensure integrity.
            invoice.amountPaid = Math.max(0, (invoice.amountPaid || 0) - creditNote.amount);
            invoice.balance = invoice.totalAmountDue - invoice.amountPaid;
            
            if (invoice.balance >= invoice.totalAmountDue) {
                invoice.status = 'PENDING';
            } else if (invoice.amountPaid > 0) {
                invoice.status = 'PARTIAL';
            }
            await invoice.save();
        }
    }

    creditNote.status = 'VOID';
    return await creditNote.save();
};

/**
 * Updates an existing Credit Note (only allowed if status is OPEN or DRAFT).
 * Uses findByIdAndUpdate with $set to avoid triggering full document validation
 * on required fields (e.g. createdBy, creatorRole) that may be missing on legacy/migrated records.
 */
const updateCreditNote = async (id, data) => {
    const creditNote = await CreditNote.findById(id);
    if (!creditNote) throw new Error("Credit Note not found.");
    
    if (!['OPEN', 'DRAFT'].includes(creditNote.status)) {
        throw new Error("Only OPEN or DRAFT credit notes can be edited. CLOSED or VOID notes are frozen.");
    }

    // Build only the fields that are actually changing
    const $set = {};

    if (data.reason) $set.reason = data.reason;
    if (data.notes !== undefined) $set.notes = data.notes;
    if (data.creditNoteDate) $set.creditNoteDate = new Date(data.creditNoteDate);
    if (data.driverId) $set.driverId = data.driverId;
    // Allow unsetting invoiceId with null, or linking to a new one
    if (data.invoiceId !== undefined) $set.invoiceId = data.invoiceId || null;
    if (typeof data.amount === 'number' && data.amount > 0) $set.amount = data.amount;

    // If this was a DRAFT (migrated record), also promote it to OPEN
    if (creditNote.status === 'DRAFT') $set.status = 'OPEN';

    const updated = await CreditNote.findByIdAndUpdate(
        id,
        { $set },
        { new: true, runValidators: false } // skip full-doc validation for legacy notes
    );

    return updated;
};

/**
 * Processes a cash/direct payout refund for an OPEN Credit Note, closing it and balance auditing it.
 */
const refundCreditNote = async (id, actor) => {
    const creditNote = await CreditNote.findById(id);
    if (!creditNote) {
        throw new Error("Credit Note not found.");
    }

    if (!['OPEN', 'DRAFT'].includes(creditNote.status)) {
        throw new Error("Only OPEN or DRAFT credit notes can be refunded.");
    }

    const driver = await Driver.findById(creditNote.driverId);
    if (!driver) {
        throw new Error("Driver not found for credit account.");
    }

    // 1. Update status to CLOSED to signify final disposition
    creditNote.status = 'CLOSED';
    creditNote.notes = `${creditNote.notes || ""}\n[REFUNDED] Cleanly settled via direct cash payout on ${new Date().toLocaleDateString()}`.trim();
    await creditNote.save();

    // 2. Post a counter-balancing PaymentTransaction & Ledger entry
    try {
        let accCode = await AccountingCode.findOne({ code: "4200" });
        if (!accCode) {
            accCode = await AccountingCode.findOne({ code: "4100" });
        }

        if (accCode) {
            const driverName = driver.personalInfo?.fullName || "Driver";
            const txNote = `Credit Note Refund Payout [${creditNote.creditNoteNumber}] for ${driverName}`;

            // CREDIT transaction of INCOME type = reverses the original DEBIT reducing operator receivable debt!
            const transactionData = {
                accountingCode: accCode._id,
                referenceId: creditNote.driverId,
                referenceModel: "Driver",
                transactionCategory: "INCOME",
                transactionType: "CREDIT", // Counter-balances the issuing DEBIT
                isTaxInclusive: false,
                baseAmount: creditNote.amount,
                totalAmount: creditNote.amount,
                paymentMethod: "CASH", // Signifies direct cash refund distribution
                status: "COMPLETED",
                paymentDate: new Date(),
                notes: txNote,
                createdBy: actor.id || actor._id,
                creatorRole: actor.role
            };

            const newTransaction = await PaymentTransaction.create(transactionData);
            const populatedTx = { ...newTransaction.toObject(), accountingCode: accCode };
            await LedgerService.autoGenerateLedgerEntry(populatedTx);
            console.log(`[CreditNoteService] Generated ledger offset refund for: ${creditNote.creditNoteNumber}`);
        }
    } catch (err) {
        console.error("[CreditNoteService] Failed generating payout ledger offset during refund:", err.message);
    }

    return creditNote;
};

module.exports = {
    createCreditNote,
    applyCreditNoteToInvoice,
    getCreditNotes,
    getCreditNoteById,
    voidCreditNote,
    updateCreditNote,
    refundCreditNote
};
