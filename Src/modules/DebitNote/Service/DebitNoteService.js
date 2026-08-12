const DebitNote = require("../Model/DebitNoteModel");
const { Invoice } = require("../../Invoice/Model/InvoiceModel");
const { Driver } = require("../../Driver/Model/DriverModel");
const PaymentTransaction = require("../../Payment/Model/PaymentTransactionModel");
const AccountingCode = require("../../AccountingCode/Model/AccountingCodeModel");
const LedgerService = require("../../Ledger/Service/LedgerService");

/**
 * Creates a new Debit Note and processes adjustments.
 */
const createDebitNote = async (data, actor) => {
    const { driverId, customerId, invoiceId, invoices, taxId, amount, reason, notes, debitNoteDate, supportingDocument } = data;

    if ((amount === undefined || amount === null) || !reason) {
        throw new Error("Missing required Debit Note fields: amount and reason are mandatory.");
    }

    if (Number(amount) < 0) {
        throw new Error("Debit Note amount must be greater than or equal to 0.");
    }

    let finalCustomerId = customerId;
    let finalSupplierId = data.supplierId;

    if (!finalCustomerId && !finalSupplierId && driverId) {
        const Customer = require("../../Customer/Model/CustomerModel");
        const customerDoc = await Customer.findOne({ driver: driverId });
        if (customerDoc) {
            finalCustomerId = customerDoc._id;
        }
    }

    if (!finalCustomerId && !finalSupplierId) {
        throw new Error("Customer or Supplier is required.");
    }

    if (finalCustomerId) {
        const Customer = require("../../Customer/Model/CustomerModel");
        const customer = await Customer.findById(finalCustomerId);
        if (!customer) {
            throw new Error("Customer not found.");
        }
    }

    if (finalSupplierId) {
        const Supplier = require("../../Supplier/Model/SupplierModel");
        const supplier = await Supplier.findById(finalSupplierId);
        if (!supplier) {
            throw new Error("Supplier not found.");
        }
    }

    const isDepositBool = data.isDeposit === true || String(data.isDeposit) === 'true';

    let debitNoteNumber = data.debitNoteNumber;
    if (!debitNoteNumber) {
        const prefix = isDepositBool ? 'DP-' : 'DN-';
        debitNoteNumber = `${prefix}${Date.now()}`;
    } else if (isDepositBool && !debitNoteNumber.toUpperCase().startsWith('DP-')) {
        debitNoteNumber = `DP-${debitNoteNumber}`;
    }

    const initialBalance = data.balance !== undefined ? Number(data.balance) : amount;
    const initialAmountPaid = data.amountPaid !== undefined ? Number(data.amountPaid) : Math.max(0, amount - initialBalance);

    // 1. Create the Debit Note Record in PENDING status
    const debitNoteDoc = await DebitNote.create({
        debitNoteNumber,
        isDeposit: isDepositBool,
        customerId: finalCustomerId || undefined,
        supplierId: finalSupplierId || undefined,
        driverId: driverId || undefined,
        invoiceId: invoiceId || undefined,
        invoices: invoices || (invoiceId ? [invoiceId] : []),
        taxId: taxId || undefined,
        amount,
        amountPaid: initialAmountPaid,
        balance: initialBalance,
        reason,
        notes,
        debitNoteDate: debitNoteDate || new Date(),
        status: data.status || 'PENDING',
        supportingDocument,
        createdBy: actor.id || actor._id,
        creatorRole: actor.role
    });

    // If an initial invoiceId was supplied, apply it immediately
    if (invoiceId) {
        try {
            await applyDebitNoteToInvoice(debitNoteDoc._id, invoiceId);
        } catch (applyErr) {
            console.error(`[DebitNoteService] Created DN ${debitNoteNumber} but failed to auto-apply to invoice:`, applyErr.message);
        }
    }

    return debitNoteDoc;
};

/**
 * Applies an existing PENDING Debit Note to a target Invoice (increases totalAmountDue & balance).
 */
const applyDebitNoteToInvoice = async (id, invoiceId) => {
    const debitNote = await DebitNote.findById(id);
    if (!debitNote) {
        throw new Error("Debit Note not found.");
    }

    if (!['PENDING', 'OPEN', 'DRAFT'].includes(debitNote.status)) {
        throw new Error("Only PENDING, OPEN, or DRAFT debit notes can be applied to invoices.");
    }

    const invoice = await Invoice.findById(invoiceId);
    if (!invoice) {
        throw new Error("Invoice not found.");
    }

    const appliedAmount = Number(debitNote.amount);
    const newTotalAmountDue = (invoice.totalAmountDue || 0) + appliedAmount;
    const newAmountPaid = invoice.amountPaid || 0;
    const newBalance = Math.max(0, newTotalAmountDue - newAmountPaid);

    let newStatus = invoice.status;
    if (newBalance <= 0) {
        newStatus = 'PAID';
    } else if (newAmountPaid > 0) {
        newStatus = 'PARTIAL';
    } else {
        const now = new Date();
        const due = invoice.dueDate ? new Date(invoice.dueDate) : now;
        newStatus = due < now ? 'OVERDUE' : 'PENDING';
    }

    await Invoice.findByIdAndUpdate(
        invoiceId,
        {
            $set: {
                totalAmountDue: newTotalAmountDue,
                balance: newBalance,
                status: newStatus
            }
        },
        { runValidators: false }
    );

    // Link invoice to Debit Note and mark as PAID with zero remaining balance
    const closedNote = await DebitNote.findByIdAndUpdate(
        id,
        { 
            $set: { invoiceId, status: 'PAID', amountPaid: debitNote.amount, balance: 0 },
            $addToSet: { invoices: invoiceId }
        },
        { new: true, runValidators: false }
    );

    console.log(`[DebitNoteService] Applied DN ${debitNote.debitNoteNumber} ($${appliedAmount}) to Invoice ${invoice.invoiceNumber}. New total due: $${newTotalAmountDue}, new balance: $${newBalance}`);
    return closedNote;
};

/**
 * Fetch all Debit Notes with pagination and lookup populations.
 */
const getDebitNotes = async (query = {}, pagination = { page: 1, limit: 10 }) => {
    const page = Number(pagination.page) || 1;
    const limit = Number(pagination.limit) || 10;
    const skip = (page - 1) * limit;

    const filter = { ...query };

    // Date Range Filtering
    if (pagination.startDate || pagination.endDate) {
        filter.debitNoteDate = {};
        if (pagination.startDate) {
            filter.debitNoteDate.$gte = new Date(pagination.startDate);
        }
        if (pagination.endDate) {
            const end = new Date(pagination.endDate);
            end.setHours(23, 59, 59, 999);
            filter.debitNoteDate.$lte = end;
        }
    }

    if (pagination.supplierId) {
        filter.supplierId = pagination.supplierId;
    }

    if (pagination.search) {
        const searchRegex = { $regex: pagination.search, $options: 'i' };

        const { Driver } = require("../../Driver/Model/DriverModel");
        const drivers = await Driver.find({
            $or: [
                { "personalInfo.fullName": searchRegex },
                { "driverId": searchRegex }
            ]
        }).select('_id');
        const driverIds = drivers.map(d => d._id);

        const Customer = require("../../Customer/Model/CustomerModel");
        const customers = await Customer.find({
            $or: [
                { "name": searchRegex },
                { "customerId": searchRegex }
            ]
        }).select('_id');
        const customerIds = customers.map(c => c._id);

        const Supplier = require("../../Supplier/Model/SupplierModel");
        const suppliers = await Supplier.find({
            $or: [
                { "name": searchRegex },
                { "supplierCode": searchRegex }
            ]
        }).select('_id');
        const supplierIds = suppliers.map(s => s._id);

        filter.$or = [
            { debitNoteNumber: searchRegex },
            { reason: searchRegex },
            { notes: searchRegex },
            { driverId: { $in: driverIds } },
            { customerId: { $in: customerIds } },
            { supplierId: { $in: supplierIds } }
        ];
    }

    const count = await DebitNote.countDocuments(filter);

    let sort = { createdAt: -1 };
    if (pagination.sortBy) {
        sort = { [pagination.sortBy]: pagination.sortOrder === 'desc' ? -1 : 1 };
    }

    const items = await DebitNote.find(filter)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .populate({
            path: 'customerId',
            select: 'customerId name email phone branch'
        })
        .populate({
            path: 'supplierId',
            select: 'supplierCode name email phone companyName category'
        })
        .populate({
            path: 'driverId',
            select: 'driverId personalInfo identityDocs'
        })
        .populate({
            path: 'invoiceId',
            select: 'invoiceNumber weekLabel totalAmountDue balance status'
        })
        .populate({
            path: 'invoices',
            select: 'invoiceNumber weekLabel totalAmountDue balance status'
        })
        .populate('taxId');

    return {
        data: items,
        total: count,
        page,
        pages: Math.ceil(count / limit)
    };
};

/**
 * Fetch a single Debit Note by ID.
 */
const getDebitNoteById = async (id) => {
    return await DebitNote.findById(id)
        .populate({
            path: 'customerId',
            select: 'customerId name email phone branch address city state country status'
        })
        .populate({
            path: 'supplierId',
            select: 'supplierCode name email phone companyName category address city state country'
        })
        .populate({
            path: 'driverId',
            select: 'driverId personalInfo branch currentVehicle'
        })
        .populate('invoiceId')
        .populate({
            path: 'invoices',
            select: 'invoiceNumber weekLabel totalAmountDue balance status'
        })
        .populate('taxId');
};

/**
 * Voids an existing Debit Note.
 */
const voidDebitNote = async (id) => {
    const debitNote = await DebitNote.findById(id);
    if (!debitNote) throw new Error("Debit Note not found.");
    if (['CANCELLED', 'VOID'].includes(debitNote.status)) throw new Error("Debit Note is already cancelled/voided.");

    // If applied to an invoice, revert invoice totalAmountDue & balance
    if (debitNote.invoiceId && ['PAID', 'PARTIAL', 'CLOSED', 'APPLIED'].includes(debitNote.status)) {
        const invoice = await Invoice.findById(debitNote.invoiceId);
        if (invoice) {
            const revertedTotal = Math.max(0, (invoice.totalAmountDue || 0) - debitNote.amount);
            const newBalance = Math.max(0, revertedTotal - (invoice.amountPaid || 0));
            let newStatus = invoice.status;
            if (newBalance <= 0) newStatus = 'PAID';
            else if (invoice.amountPaid > 0) newStatus = 'PARTIAL';

            await Invoice.findByIdAndUpdate(debitNote.invoiceId, {
                $set: { totalAmountDue: revertedTotal, balance: newBalance, status: newStatus }
            });
        }
    }

    debitNote.status = 'CANCELLED';
    await debitNote.save();
    return debitNote;
};

/**
 * Updates editable fields of a Debit Note.
 */
const updateDebitNote = async (id, data) => {
    const debitNote = await DebitNote.findById(id);
    if (!debitNote) throw new Error("Debit Note not found.");
    if (['CANCELLED', 'VOID'].includes(debitNote.status)) throw new Error("Cannot update a cancelled/voided Debit Note.");

    if (data.reason !== undefined) debitNote.reason = data.reason;
    if (data.notes !== undefined) debitNote.notes = data.notes;
    if (data.debitNoteDate !== undefined) debitNote.debitNoteDate = data.debitNoteDate;

    await debitNote.save();
    return debitNote;
};

/**
 * Process Bulk Upload of Debit Notes.
 */
const bulkUploadDebitNotes = async (rows, actor) => {
    const Customer = require("../../Customer/Model/CustomerModel");
    const { Driver } = require("../../Driver/Model/DriverModel");
    const createdNotes = [];

    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const amount = Number(row.amount || row.Amount);
        const reason = row.reason || row.Reason || "Bulk Debit Note";
        const customerRef = row.customerId || row.Customer || row.driverId || row.Driver;

        if (!amount || isNaN(amount) || amount <= 0) continue;

        let customerDoc = await Customer.findOne({
            $or: [{ _id: customerRef }, { customerId: customerRef }, { name: customerRef }]
        });

        let driverDoc = null;
        if (!customerDoc) {
            driverDoc = await Driver.findOne({
                $or: [{ _id: customerRef }, { driverId: customerRef }, { "personalInfo.fullName": customerRef }]
            });
            if (driverDoc) {
                customerDoc = await Customer.findOne({ driver: driverDoc._id });
            }
        }

        if (!customerDoc) continue;

        const dnDoc = await createDebitNote({
            customerId: customerDoc._id,
            driverId: driverDoc ? driverDoc._id : undefined,
            amount,
            reason,
            notes: row.notes || row.Notes || '',
            debitNoteDate: row.date ? new Date(row.date) : new Date()
        }, actor);

        createdNotes.push(dnDoc);
    }

    return { createdCount: createdNotes.length, createdNotes };
};

module.exports = {
    createDebitNote,
    applyDebitNoteToInvoice,
    getDebitNotes,
    getDebitNoteById,
    voidDebitNote,
    updateDebitNote,
    bulkUploadDebitNotes
};
