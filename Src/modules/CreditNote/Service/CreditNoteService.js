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
    const { driverId, customerId, invoiceId, invoices, taxId, amount, reason, notes, creditNoteDate, supportingDocument } = data;

    if ((amount === undefined || amount === null) || !reason) {
        throw new Error("Missing required Credit Note fields: amount and reason are mandatory.");
    }

    if (Number(amount) < 0) {
        throw new Error("Credit Note amount must be greater than or equal to 0.");
    }

    let finalCustomerId = customerId;
    if (!finalCustomerId && driverId) {
        const Customer = require("../../Customer/Model/CustomerModel");
        const customerDoc = await Customer.findOne({ driver: driverId });
        if (customerDoc) {
            finalCustomerId = customerDoc._id;
        }
    }

    if (!finalCustomerId) {
        throw new Error("Customer is required (directly or resolved via Driver).");
    }

    const Customer = require("../../Customer/Model/CustomerModel");
    const customer = await Customer.findById(finalCustomerId);
    if (!customer) {
        throw new Error("Customer not found.");
    }

    const creditNoteNumber = `CN-${Date.now()}`;

    // 1. Create the Credit Note Record directly in OPEN status (without applying yet)
    const creditNoteDoc = await CreditNote.create({
        creditNoteNumber,
        customerId: finalCustomerId,
        driverId: driverId || undefined,
        invoiceId: invoiceId || undefined,
        invoices: invoices || (invoiceId ? [invoiceId] : []),
        taxId: taxId || undefined,
        amount,
        reason,
        notes,
        creditNoteDate: creditNoteDate || new Date(),
        status: 'OPEN',
        supportingDocument,
        createdBy: actor.id || actor._id,
        creatorRole: actor.role
    });

    // 2. Create PaymentTransaction & Ledger entry for Zoho accounting immediately on issuance
    try {
        // Search for code 4200 (seeded earlier). Fallback to 4100.
        let accCode = await AccountingCode.findOne({ code: "4200" });
        if (!accCode) {
            accCode = await AccountingCode.findOne({ code: "IN0002" }) || await AccountingCode.findOne({ code: "4100" });
        }

        if (accCode) {
            const customerName = customer.name || "Customer";
            const txNote = `Credit Note [${creditNoteNumber}]: ${reason} for ${customerName}${notes ? ' - ' + notes : ''}`;

            // Bind explicitly to Customer Model so it registers under Customer Ledger Accounts!
            const transactionData = {
                accountingCode: accCode._id,
                referenceId: finalCustomerId,
                referenceModel: "Customer",
                transactionCategory: "INCOME",
                transactionType: "DEBIT", // Reduces the customer receivable account
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
            console.log(`[CreditNoteService] Generated ledger reversal linked to Customer: ${creditNoteNumber}`);
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

    // Ensure credit note customer matches invoice customer
    const invCustomerId = typeof invoice.customer === 'object' ? invoice.customer._id.toString() : invoice.customer.toString();
    if (creditNote.customerId.toString() !== invCustomerId) {
        throw new Error("Operational mismatch: Credit Note customer does not match Invoice customer.");
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
        await InvoiceService.rolloverCustomerInvoices(invoice.customer);
    } catch (rollErr) {
        console.error("[CreditNoteService] Carry-over rollover failed during application:", rollErr.message);
    }

    // Link invoice to Credit Note and CLOSE it (also bypass full-doc validation)
    const closedNote = await CreditNote.findByIdAndUpdate(
        id,
        { 
            $set: { invoiceId, status: 'CLOSED' },
            $addToSet: { invoices: invoiceId }
        },
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

    // Date Range Filtering
    if (pagination.startDate || pagination.endDate) {
        filter.creditNoteDate = {};
        if (pagination.startDate) filter.creditNoteDate.$gte = new Date(pagination.startDate);
        if (pagination.endDate) filter.creditNoteDate.$lte = new Date(pagination.endDate);
    }

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

        // Find matching customers
        const Customer = require("../../Customer/Model/CustomerModel");
        const customers = await Customer.find({
            $or: [
                { "name": searchRegex },
                { "customerId": searchRegex }
            ]
        }).select('_id');
        const customerIds = customers.map(c => c._id);

        filter.$or = [
            { creditNoteNumber: searchRegex },
            { reason: searchRegex },
            { notes: searchRegex },
            { driverId: { $in: driverIds } },
            { customerId: { $in: customerIds } }
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
            path: 'customerId',
            select: 'customerId name email phone branch'
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
 * Fetch a single Credit Note by ID.
 */
const getCreditNoteById = async (id) => {
    return await CreditNote.findById(id)
        .populate({
            path: 'customerId',
            select: 'customerId name email phone branch address city state country status'
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
    if (data.customerId) $set.customerId = data.customerId;
    // Allow unsetting invoiceId with null, or linking to a new one
    if (data.invoiceId !== undefined) $set.invoiceId = data.invoiceId || null;
    if (data.invoices !== undefined) $set.invoices = data.invoices || [];
    if (data.taxId !== undefined) $set.taxId = data.taxId || null;
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

    const Customer = require("../../Customer/Model/CustomerModel");
    const customer = await Customer.findById(creditNote.customerId);
    if (!customer) {
        throw new Error("Customer not found for credit account.");
    }

    // 1. Update status to CLOSED to signify final disposition
    creditNote.status = 'CLOSED';
    creditNote.notes = `${creditNote.notes || ""}\n[REFUNDED] Cleanly settled via direct cash payout on ${new Date().toLocaleDateString()}`.trim();
    await creditNote.save();

    // 2. Post a counter-balancing PaymentTransaction & Ledger entry
    try {
        let accCode = await AccountingCode.findOne({ code: "4200" });
        if (!accCode) {
            accCode = await AccountingCode.findOne({ code: "IN0002" }) || await AccountingCode.findOne({ code: "4100" });
        }

        if (accCode) {
            const customerName = customer.name || "Customer";
            const txNote = `Credit Note Refund Payout [${creditNote.creditNoteNumber}] for ${customerName}`;

            // CREDIT transaction of INCOME type = reverses the original DEBIT reducing operator receivable debt!
            const transactionData = {
                accountingCode: accCode._id,
                referenceId: creditNote.customerId,
                referenceModel: "Customer",
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

/**
 * Bulk upload credit notes from an Excel/CSV parsed JSON array of rows.
 */
const bulkUploadCreditNotes = async (rows, actor) => {
    if (!rows || !Array.isArray(rows) || rows.length === 0) {
        throw new Error("No data rows provided.");
    }

    const Customer = require("../../Customer/Model/CustomerModel");
    const { Invoice } = require("../../Invoice/Model/InvoiceModel");
    const AccountingCode = require("../../AccountingCode/Model/AccountingCodeModel");
    const PaymentTransaction = require("../../Payment/Model/PaymentTransactionModel");
    const LedgerService = require("../../Ledger/Service/LedgerService");

    // 1. Fetch reference collections for fast lookups
    const customersList = await Customer.find({ isDeleted: false });
    const customersByName = new Map();
    const customersById = new Map();
    for (const c of customersList) {
        if (c.name) {
            customersByName.set(c.name.trim().toLowerCase().replace(/\s+/g, ' '), c);
        }
        if (c.customerId) {
            customersById.set(c.customerId.trim().toLowerCase(), c);
        }
        if (c.customerNumber) {
            customersById.set(c.customerNumber.trim().toLowerCase(), c);
        }
    }

    const TaxModel = require("../../Tax/Model/TaxModel");
    const taxesList = await TaxModel.find({ isDeleted: false });
    const taxesByName = new Map();
    const taxesByRate = new Map();
    for (const t of taxesList) {
        if (t.name) {
            taxesByName.set(t.name.trim().toLowerCase(), t);
        }
        if (t.rate !== undefined && t.rate !== null) {
            taxesByRate.set(t.rate, t);
        }
    }

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

    const createdNotes = [];
    const errors = [];
    const skipped = [];

    // Process each row
    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const origIdx = i + 1;

        // Resolve Customer Name - MANDATORY
        const customerNameVal = getRowVal(row, ["Customer Name", "customerName", "customer"]);
        const customerNameInput = (customerNameVal || "").toString().trim().toLowerCase().replace(/\s+/g, ' ');

        let customerDoc = null;
        if (customerNameInput) {
            customerDoc = customersByName.get(customerNameInput);
            if (!customerDoc) {
                for (const [dbName, dbCust] of customersByName.entries()) {
                    const cleanDb = dbName.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim().replace(/\s+/g, ' ');
                    const cleanInput = customerNameInput.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim().replace(/\s+/g, ' ');
                    if (cleanDb === cleanInput || cleanDb.includes(cleanInput) || cleanInput.includes(cleanDb)) {
                        customerDoc = dbCust;
                        break;
                    }
                }
            }
        }

        // Fallback to customer ID
        if (!customerDoc) {
            const customerIdVal = getRowVal(row, ["Customer ID", "customerId", "customerNumber"]);
            const customerNumberVal = getRowVal(row, ["Customer Number", "customerNumber"]);
            if (customerIdVal) {
                customerDoc = customersById.get(customerIdVal.toString().trim().toLowerCase());
            }
            if (!customerDoc && customerNumberVal) {
                customerDoc = customersById.get(customerNumberVal.toString().trim().toLowerCase());
            }
        }

        if (!customerDoc) {
            errors.push(`Row ${origIdx}: Customer Name "${customerNameVal || ''}" is mandatory but was not found in database.`);
            continue;
        }

        // Resolve Credit Note Number
        const cnNoVal = getRowVal(row, ["Credit Note Number", "creditNoteNumber", "CreditNotes ID", "creditNotesId"]);
        const key = (cnNoVal || "").toString().trim();



        // Resolve amount
        const amountVal = getRowVal(row, ["Total", "total", "Amount", "amount", "SubTotal", "subtotal", "Balance", "balance", "Item Total", "itemTotal"]);
        const totalAmount = parseFloat(amountVal !== undefined && amountVal !== null ? amountVal : 0);
        if (isNaN(totalAmount) || totalAmount < 0) {
            errors.push(`Row ${origIdx}: Invalid credit note amount "${amountVal || ''}".`);
            continue;
        }

        // Resolve dates
        const dateVal = getRowVal(row, ["Credit Note Date", "creditNoteDate", "Issued Date", "issuedDate", "Date", "date"]);
        const creditNoteDate = parseFlexibleDate(dateVal) || new Date();

        // Resolve reason
        const reasonVal = getRowVal(row, ["Subject", "subject", "Adjustment Description", "adjustmentDescription", "Reason", "reason"]) || "Bulk Upload Correction";
        const reason = reasonVal.toString().trim();

        // Build notes
        const notesList = [];
        const excelNotes = getRowVal(row, ["Notes", "notes", "description"]);
        if (excelNotes) notesList.push(excelNotes);

        const refNo = getRowVal(row, ["Reference#", "referenceNumber", "Reference Number"]);
        if (refNo) notesList.push(`Reference: ${refNo}`);

        // Custom Fields
        const staffName = getRowVal(row, ["CF.STAFF NAME", "cfStaffName"]);
        if (staffName) notesList.push(`Staff Name: ${staffName}`);
        
        const cufe = getRowVal(row, ["CF.CUFE", "cfCufe"]);
        if (cufe) notesList.push(`CUFE: ${cufe}`);
        
        const protocol = getRowVal(row, ["CF.Protocolo de autorización", "cfProtocol"]);
        if (protocol) notesList.push(`Protocol: ${protocol}`);

        const authDate = getRowVal(row, ["CF.Fecha de autorización", "cfAuthDate"]);
        if (authDate) notesList.push(`Auth Date: ${authDate}`);

        // Tax Fields
        const taxName = getRowVal(row, ["Item Tax", "itemTax", "taxName"]);
        const taxRate = getRowVal(row, ["Item Tax %", "itemTaxPct", "taxRate"]);
        const taxAmount = getRowVal(row, ["Item Tax Amount", "itemTaxAmount", "taxAmount"]);
        const taxType = getRowVal(row, ["Item Tax Type", "itemTaxType", "taxType"]);
        
        if (taxName || taxRate || taxAmount || taxType) {
            const taxParts = [];
            if (taxName) taxParts.push(`Tax Name: ${taxName}`);
            if (taxRate) taxParts.push(`Tax %: ${taxRate}`);
            if (taxAmount) taxParts.push(`Tax Amount: ${taxAmount}`);
            if (taxType) taxParts.push(`Tax Type: ${taxType}`);
            notesList.push(`[Tax Details] ${taxParts.join(', ')}`);
        }

        // Resolve Tax Document
        let taxDoc = null;
        const taxNameVal = getRowVal(row, ["Item Tax", "itemTax", "taxName", "Tax1 ID", "tax1Id", "Tax ID", "taxId"]);
        if (taxNameVal) {
            const cleanTaxName = taxNameVal.toString().trim().toLowerCase();
            taxDoc = taxesByName.get(cleanTaxName);
        }
        if (!taxDoc) {
            if (taxRate !== undefined && taxRate !== null) {
                const cleanTaxRate = parseFloat(taxRate);
                if (!isNaN(cleanTaxRate)) {
                    taxDoc = taxesByRate.get(cleanTaxRate);
                }
            }
        }

        // Resolve Applied Invoice Numbers (comma separated)
        const rawInvNumbers = getRowVal(row, ["Applied Invoice Number", "appliedInvoiceNumber", "Invoice Number", "invoiceNumber"]) || "";
        if (rawInvNumbers) {
            notesList.push(`Applied Invoices: ${rawInvNumbers}`);
        }

        const finalNotes = notesList.join("\n");
        const invNumbers = rawInvNumbers.toString().split(',').map(s => s.trim()).filter(Boolean);
        const queryInvNumbers = Array.from(new Set(invNumbers.flatMap(num => {
            const clean = num.replace(/\s+/g, '');
            const rawDigits = num.replace(/\D/g, '');
            const parsedIntStr = rawDigits ? parseInt(rawDigits, 10).toString() : '';
            
            return [
                num,
                num.toUpperCase(),
                num.toLowerCase(),
                clean,
                clean.toUpperCase(),
                clean.toLowerCase(),
                rawDigits,
                parsedIntStr,
                `INV-${clean}`,
                `INV-${rawDigits}`,
                `INV-${parsedIntStr}`,
                `INV-${String(rawDigits).padStart(6, '0')}`,
                `INV-${String(parsedIntStr).padStart(6, '0')}`,
                `INV- ${clean}`,
                `INV- ${rawDigits}`
            ].filter(Boolean);
        })));

        let customerInvoices = [];
        if (invNumbers.length > 0) {
            const foundInvoices = await Invoice.find({
                invoiceNumber: { $in: queryInvNumbers },
                isDeleted: false
            });
            // Filter to only this customer's invoices
            customerInvoices = foundInvoices.filter(inv => {
                if (!inv.customer) return false;
                const invCustomerId = inv.customer._id 
                    ? inv.customer._id.toString() 
                    : inv.customer.toString();
                return invCustomerId === customerDoc._id.toString();
            });

            // Fallback: If no invoices matched this customer name specifically,
            // but we found matching invoice numbers in the system, use them directly.
            if (customerInvoices.length === 0 && foundInvoices.length > 0) {
                customerInvoices = foundInvoices;
            }
        }

        let remainingAmount = totalAmount;
        const cnSegmentNumbers = [];

        if (totalAmount === 0) {
            const creditNoteNumber = key && !key.startsWith("TEMP-")
                ? key
                : `CN-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

            const isClosed = customerInvoices.length > 0;
            await CreditNote.create({
                creditNoteNumber,
                customerId: customerDoc._id,
                driverId: customerDoc.driver || undefined,
                invoiceId: isClosed ? customerInvoices[0]._id : undefined,
                invoices: isClosed ? customerInvoices.map(inv => inv._id) : [],
                taxId: taxDoc ? taxDoc._id : undefined,
                amount: 0,
                reason,
                notes: finalNotes,
                creditNoteDate,
                status: isClosed ? 'CLOSED' : 'OPEN',
                createdBy: actor.id || actor._id,
                creatorRole: actor.role
            });

            cnSegmentNumbers.push(creditNoteNumber);

            if (isClosed) {
                const invoice = customerInvoices[0];
                const newPaymentEntry = {
                    amount: 0,
                    paidAt: creditNoteDate,
                    paymentMethod: "Prepayment Credit",
                    note: `Credit Note Applied (${creditNoteNumber})`
                };
                await Invoice.findByIdAndUpdate(
                    invoice._id,
                    { $push: { payments: newPaymentEntry } },
                    { runValidators: false }
                );
            }
        } else {
            // Apply credit note sequentially across target invoices
            if (customerInvoices.length > 0 && remainingAmount > 0) {
                for (const invoice of customerInvoices) {
                    if (remainingAmount <= 0) break;
                    if (invoice.status === 'PAID') continue;

                    const appliedAmount = Math.min(remainingAmount, invoice.balance);
                    if (appliedAmount <= 0) continue;

                    const creditNoteNumber = key && !key.startsWith("TEMP-")
                        ? (customerInvoices.length > 1 ? `${key}-${invoice.invoiceNumber}` : key)
                        : `CN-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;



                    // Create CLOSED Credit Note document
                    await CreditNote.create({
                        creditNoteNumber,
                        customerId: customerDoc._id,
                        driverId: customerDoc.driver || undefined,
                        invoiceId: invoice._id,
                        invoices: [invoice._id],
                        taxId: taxDoc ? taxDoc._id : undefined,
                        amount: appliedAmount,
                        reason,
                        notes: finalNotes,
                        creditNoteDate,
                        status: 'CLOSED',
                        createdBy: actor.id || actor._id,
                        creatorRole: actor.role
                    });

                    cnSegmentNumbers.push(creditNoteNumber);

                    // Update Invoice
                    const newAmountPaid = (invoice.amountPaid || 0) + appliedAmount;
                    const newBalance = Math.max(0, invoice.balance - appliedAmount);
                    let newStatus = invoice.status;
                    if (newBalance <= 0) {
                        newStatus = 'PAID';
                    } else if (newAmountPaid > 0) {
                        newStatus = 'PARTIAL';
                    }

                    const newPaymentEntry = {
                        amount: appliedAmount,
                        paidAt: creditNoteDate,
                        paymentMethod: "Prepayment Credit",
                        note: `Credit Note Applied (${creditNoteNumber})`
                    };

                    await Invoice.findByIdAndUpdate(
                        invoice._id,
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

                    // Rollover dynamic balance
                    try {
                        const InvoiceService = require("../../Invoice/Service/InvoiceService");
                        await InvoiceService.rolloverCustomerInvoices(customerDoc._id);
                    } catch (rollErr) {
                        console.error("[CreditNoteService] Rollover customer invoices failed in bulk application:", rollErr.message);
                    }

                    // Generate ledger reversal
                    try {
                        let accCode = await AccountingCode.findOne({ code: "4200" });
                        if (!accCode) {
                            accCode = await AccountingCode.findOne({ code: "IN0002" }) || await AccountingCode.findOne({ code: "4100" });
                        }

                        if (accCode) {
                            const customerName = customerDoc.name || "Customer";
                            const txNote = `Credit Note Applied [${creditNoteNumber}]: ${reason} to Invoice ${invoice.invoiceNumber} for ${customerName}${finalNotes ? ' - ' + finalNotes : ''}`;

                            const transactionData = {
                                accountingCode: accCode._id,
                                referenceId: customerDoc._id,
                                referenceModel: "Customer",
                                transactionCategory: "INCOME",
                                transactionType: "DEBIT",
                                isTaxInclusive: false,
                                baseAmount: appliedAmount,
                                totalAmount: appliedAmount,
                                paymentMethod: "OTHER",
                                status: "COMPLETED",
                                paymentDate: creditNoteDate,
                                notes: txNote,
                                createdBy: actor.id || actor._id,
                                creatorRole: actor.role
                            };

                            const newTransaction = await PaymentTransaction.create(transactionData);
                            const populatedTx = { ...newTransaction.toObject(), accountingCode: accCode };
                            await LedgerService.autoGenerateLedgerEntry(populatedTx);
                        }
                    } catch (err) {
                        console.error("[CreditNoteService] Failed to generate ledger record for Credit Note Segment:", err.message);
                    }

                    remainingAmount -= appliedAmount;
                }
            }
        }

        // Create an OPEN credit note for any leftover amount (or if no invoice was specified)
        if (remainingAmount > 0) {
            const creditNoteNumber = key && !key.startsWith("TEMP-")
                ? (cnSegmentNumbers.length > 0 ? `${key}-OPEN` : key)
                : `CN-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

            {
                await CreditNote.create({
                    creditNoteNumber,
                    customerId: customerDoc._id,
                    driverId: customerDoc.driver || undefined,
                    invoices: customerInvoices.map(inv => inv._id),
                    taxId: taxDoc ? taxDoc._id : undefined,
                    amount: remainingAmount,
                    reason,
                    notes: finalNotes,
                    creditNoteDate,
                    status: 'OPEN',
                    createdBy: actor.id || actor._id,
                    creatorRole: actor.role
                });

                cnSegmentNumbers.push(creditNoteNumber);

                // Generate ledger reversal
                try {
                    let accCode = await AccountingCode.findOne({ code: "4200" });
                    if (!accCode) {
                        accCode = await AccountingCode.findOne({ code: "IN0002" }) || await AccountingCode.findOne({ code: "4100" });
                    }

                    if (accCode) {
                        const customerName = customerDoc.name || "Customer";
                        const txNote = `Credit Note Issued [${creditNoteNumber}]: ${reason} for ${customerName}${finalNotes ? ' - ' + finalNotes : ''}`;

                        const transactionData = {
                            accountingCode: accCode._id,
                            referenceId: customerDoc._id,
                            referenceModel: "Customer",
                            transactionCategory: "INCOME",
                            transactionType: "DEBIT",
                            isTaxInclusive: false,
                            baseAmount: remainingAmount,
                            totalAmount: remainingAmount,
                            paymentMethod: "OTHER",
                            status: "COMPLETED",
                            paymentDate: creditNoteDate,
                            notes: txNote,
                            createdBy: actor.id || actor._id,
                            creatorRole: actor.role
                        };

                        const newTransaction = await PaymentTransaction.create(transactionData);
                        const populatedTx = { ...newTransaction.toObject(), accountingCode: accCode };
                        await LedgerService.autoGenerateLedgerEntry(populatedTx);
                    }
                } catch (err) {
                    console.error("[CreditNoteService] Failed to generate ledger record for Remaining Credit Note:", err.message);
                }
            }
        }

        createdNotes.push(...cnSegmentNumbers);
    }

    return {
        successCount: createdNotes.length,
        errorCount: errors.length,
        skippedCount: skipped.length,
        errors,
        skipped,
        createdNotes
    };
};

module.exports = {
    createCreditNote,
    applyCreditNoteToInvoice,
    getCreditNotes,
    getCreditNoteById,
    voidCreditNote,
    updateCreditNote,
    refundCreditNote,
    bulkUploadCreditNotes
};
