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

    // Ensure Debit Note Number is unique
    const existingNote = await DebitNote.findOne({ 
        debitNoteNumber: { $regex: new RegExp(`^${debitNoteNumber.trim()}$`, 'i') } 
    });
    if (existingNote) {
        throw new Error(`Debit Note Number "${debitNoteNumber}" already exists in the database.`);
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
 * Applies an existing PENDING Debit Note to a target Supplier Bill (reduces bill balanceDue).
 */
const applyDebitNoteToBill = async (id, billId) => {
    const debitNote = await DebitNote.findById(id);
    if (!debitNote) {
        throw new Error("Debit Note not found.");
    }

    if (!['PENDING', 'OPEN', 'DRAFT'].includes(debitNote.status)) {
        throw new Error("Only PENDING, OPEN, or DRAFT debit notes can be applied to bills.");
    }

    const Bill = require("../../Bill/Model/BillModel");
    const bill = await Bill.findById(billId);
    if (!bill) {
        throw new Error("Target Supplier Bill not found.");
    }

    const appliedAmount = Number(debitNote.amount);
    const newAmountPaid = (bill.amountPaid || 0) + appliedAmount;
    const newBalanceDue = Math.max(0, (bill.totalAmount || 0) - newAmountPaid);
    const newStatus = newBalanceDue <= 0 ? 'PAID' : 'PARTIALLY_PAID';

    if (!bill.payments) bill.payments = [];
    bill.payments.push({
        amount: appliedAmount,
        paidAt: new Date(),
        paymentMethod: "Prepayment Credit",
        note: `Applied Debit Note ${debitNote.debitNoteNumber}`
    });

    bill.amountPaid = newAmountPaid;
    bill.balanceDue = newBalanceDue;
    bill.status = newStatus;
    if (newBalanceDue <= 0) bill.paidAt = new Date();
    await bill.save();

    const closedNote = await DebitNote.findByIdAndUpdate(
        id,
        {
            $set: {
                billId,
                status: 'PAID',
                amountPaid: debitNote.amount,
                balance: 0,
                notes: (debitNote.notes ? debitNote.notes + ' | ' : '') + `Applied to Bill ${bill.billNumber}`
            },
            $addToSet: { bills: billId }
        },
        { new: true, runValidators: false }
    );

    console.log(`[DebitNoteService] Applied DN ${debitNote.debitNoteNumber} ($${appliedAmount}) to Bill ${bill.billNumber}. New bill balance: $${newBalanceDue}`);
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
        .populate('billId')
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
    if (!rows || !Array.isArray(rows) || rows.length === 0) {
        throw new Error("No data rows provided for bulk upload.");
    }

    const Customer = require("../../Customer/Model/CustomerModel");
    const { Driver } = require("../../Driver/Model/DriverModel");
    const Supplier = require("../../Supplier/Model/SupplierModel");
    const TaxModel = require("../../Tax/Model/TaxModel");
    const { Invoice } = require("../../Invoice/Model/InvoiceModel");

    // 1. Fetch reference collections for fast lookups
    const [customersList, driversList, suppliersList, taxesList, existingDebitNotes] = await Promise.all([
        Customer.find({ isDeleted: false }).lean(),
        Driver.find({ isDeleted: false }).select("_id driverId personalInfo").lean(),
        Supplier.find({ isDeleted: false }).lean(),
        TaxModel.find({ isDeleted: false }).lean(),
        DebitNote.find({}, { debitNoteNumber: 1 }).lean()
    ]);

    const existingDebitNoteNumbers = new Set(
        existingDebitNotes
            .map(d => (d.debitNoteNumber || '').trim().toLowerCase())
            .filter(Boolean)
    );
    const seenBatchNumbers = new Set();

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
        if (c._id) {
            customersById.set(c._id.toString().toLowerCase(), c);
        }
    }

    const driversByName = new Map();
    const driversById = new Map();
    for (const d of driversList) {
        if (d.personalInfo && d.personalInfo.fullName) {
            driversByName.set(d.personalInfo.fullName.trim().toLowerCase().replace(/\s+/g, ' '), d);
        }
        if (d.driverId) {
            driversById.set(d.driverId.trim().toLowerCase(), d);
        }
        if (d._id) {
            driversById.set(d._id.toString().toLowerCase(), d);
        }
    }

    const suppliersByName = new Map();
    const suppliersById = new Map();
    for (const s of suppliersList) {
        if (s.name) suppliersByName.set(s.name.trim().toLowerCase().replace(/\s+/g, ' '), s);
        if (s.companyName) suppliersByName.set(s.companyName.trim().toLowerCase().replace(/\s+/g, ' '), s);
        if (s.supplierCode) suppliersById.set(s.supplierCode.trim().toLowerCase(), s);
        if (s.vendorNumber) suppliersById.set(s.vendorNumber.trim().toLowerCase(), s);
        if (s._id) suppliersById.set(s._id.toString().toLowerCase(), s);
    }

    const taxesByName = new Map();
    const taxesByRate = new Map();
    for (const t of taxesList) {
        if (t.name) taxesByName.set(t.name.trim().toLowerCase(), t);
        if (t.rate !== undefined && t.rate !== null) taxesByRate.set(t.rate, t);
    }

    const getRowVal = (r, possibleKeys) => {
        if (!r) return undefined;
        const normalize = (s) => (s || '').toString().replace(/^\ufeff/, '').trim().toLowerCase().replace(/[\s\-_.:]/g, '');
        for (const key of possibleKeys) {
            const cleanKey = normalize(key);
            if (r[key] !== undefined && r[key] !== null && String(r[key]).trim() !== '') {
                return r[key];
            }
            for (const k of Object.keys(r)) {
                if (normalize(k) === cleanKey) {
                    const val = r[k];
                    if (val !== undefined && val !== null && String(val).trim() !== '') {
                        return val;
                    }
                }
            }
        }
        return undefined;
    };

    const parseFlexibleDate = (dateVal) => {
        if (!dateVal && dateVal !== 0) return null;
        if (dateVal instanceof Date) return isNaN(dateVal.getTime()) ? null : dateVal;
        
        const num = typeof dateVal === 'number' 
            ? dateVal 
            : (typeof dateVal === 'string' && /^\d{4,6}(\.\d+)?$/.test(dateVal.trim()) ? parseFloat(dateVal.trim()) : null);
        if (num !== null && !isNaN(num) && num > 10000 && num < 100000) {
            const date = new Date(Math.round((num - 25569) * 86400 * 1000));
            return isNaN(date.getTime()) ? null : date;
        }

        const str = dateVal.toString().trim();
        if (!str) return null;

        // YYYY-MM-DD or YYYY/MM/DD or YYYY.MM.DD
        const ymdRegex = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/;
        let match = str.match(ymdRegex);
        if (match) {
            return new Date(Date.UTC(parseInt(match[1], 10), parseInt(match[2], 10) - 1, parseInt(match[3], 10)));
        }

        // DD-MM-YYYY or DD/MM/YYYY or DD.MM.YYYY or DD.MM.YY or DD-MM-YY
        const dmyRegex = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/;
        match = str.match(dmyRegex);
        if (match) {
            let yr = parseInt(match[3], 10);
            if (yr < 100) yr += (yr < 50 ? 2000 : 1900);
            return new Date(Date.UTC(yr, parseInt(match[2], 10) - 1, parseInt(match[1], 10)));
        }

        const parsedDate = new Date(str);
        return isNaN(parsedDate.getTime()) ? null : parsedDate;
    };

    const createdNotes = [];
    const errors = [];

    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const rowNum = i + 1;

        // Resolve amount
        const amountVal = getRowVal(row, ["Total", "total", "Amount", "amount", "SubTotal", "subtotal", "Item Total"]);
        const amount = parseFloat(amountVal !== undefined && amountVal !== null ? amountVal : 0);
        if (isNaN(amount) || amount <= 0) {
            errors.push(`Row ${rowNum}: Invalid or missing debit amount "${amountVal || ''}".`);
            continue;
        }

        // Resolve target (Customer or Supplier)
        const customerNameVal = getRowVal(row, ["Customer Name", "customerName", "Customer", "customer"]);
        const customerIdVal = getRowVal(row, ["Customer ID", "customerId", "Customer Number", "customerNumber"]);
        const driverNameVal = getRowVal(row, ["Driver Name", "driverName", "Driver", "driver"]);
        const driverIdVal = getRowVal(row, ["Driver ID", "driverId"]);
        const vendorNameVal = getRowVal(row, ["Vendor Name", "vendorName", "Supplier Name", "supplierName", "Supplier", "supplier"]);
        const vendorIdVal = getRowVal(row, ["Vendor Number", "vendorNumber", "Supplier ID", "supplierId", "Supplier Code", "supplierCode"]);

        let customerDoc = null;
        let driverDoc = null;
        let supplierDoc = null;

        // Try customer match
        if (customerNameVal) {
            const clean = customerNameVal.toString().trim().toLowerCase().replace(/\s+/g, ' ');
            customerDoc = customersByName.get(clean);
            if (!customerDoc) {
                for (const [dbName, dbCust] of customersByName.entries()) {
                    if (dbName === clean || dbName.includes(clean) || clean.includes(dbName)) {
                        customerDoc = dbCust;
                        break;
                    }
                }
            }
        }
        if (!customerDoc && customerIdVal) {
            customerDoc = customersById.get(customerIdVal.toString().trim().toLowerCase());
        }

        // Try driver match if customer not found
        if (!customerDoc && (driverNameVal || driverIdVal)) {
            if (driverNameVal) {
                const cleanD = driverNameVal.toString().trim().toLowerCase().replace(/\s+/g, ' ');
                driverDoc = driversByName.get(cleanD);
            }
            if (!driverDoc && driverIdVal) {
                driverDoc = driversById.get(driverIdVal.toString().trim().toLowerCase());
            }
            if (driverDoc) {
                customerDoc = customersList.find(c => c.driver && c.driver.toString() === driverDoc._id.toString());
            }
        }

        // Try supplier / vendor match if still not found
        if (!customerDoc && (vendorNameVal || vendorIdVal)) {
            if (vendorNameVal) {
                const cleanV = vendorNameVal.toString().trim().toLowerCase().replace(/\s+/g, ' ');
                supplierDoc = suppliersByName.get(cleanV);
                if (!supplierDoc) {
                    for (const [sName, sObj] of suppliersByName.entries()) {
                        if (sName === cleanV || sName.includes(cleanV) || cleanV.includes(sName)) {
                            supplierDoc = sObj;
                            break;
                        }
                    }
                }
            }
            if (!supplierDoc && vendorIdVal) {
                supplierDoc = suppliersById.get(vendorIdVal.toString().trim().toLowerCase());
            }
        }

        if (!customerDoc && !supplierDoc) {
            errors.push(`Row ${rowNum}: Customer or Vendor ("${customerNameVal || vendorNameVal || customerIdVal || ''}") could not be identified.`);
            continue;
        }

        // Reason
        const reasonVal = getRowVal(row, ["Reason", "reason", "Subject", "subject", "Item Name", "itemName", "Item Desc", "itemDesc", "Description", "description"]);
        const reason = (reasonVal || "").toString().trim() || "Bulk Debit Note";

        // Notes
        const notesVal = getRowVal(row, ["Notes", "notes", "Remarks", "remarks", "Item Desc"]);
        const notes = (notesVal || "").toString().trim();

        // Date
        const dateVal = getRowVal(row, ["Debit Note Date", "debitNoteDate", "Date", "date", "Invoice Date", "invoiceDate", "Issued Date"]);
        const debitNoteDate = parseFlexibleDate(dateVal) || new Date();

        // Debit Note Number
        const dnNoVal = getRowVal(row, ["Debit Note Number", "debitNoteNumber", "Debit Note ID", "debitNoteId", "Reference#", "reference"]);
        let debitNoteNumber = dnNoVal ? dnNoVal.toString().trim() : undefined;

        // Is Deposit
        const isDepVal = getRowVal(row, ["Is Deposit", "isDeposit", "Deposit", "deposit"]);
        const isDeposit = isDepVal === true || String(isDepVal).toLowerCase() === 'true' || String(isDepVal) === '1';

        if (debitNoteNumber && isDeposit && !debitNoteNumber.toUpperCase().startsWith('DP-')) {
            debitNoteNumber = `DP-${debitNoteNumber}`;
        }

        // Validate Debit Note Number uniqueness
        if (debitNoteNumber) {
            const cleanDn = debitNoteNumber.toLowerCase();
            if (seenBatchNumbers.has(cleanDn)) {
                errors.push(`Row ${rowNum}: Duplicate Debit Note ID/Number "${debitNoteNumber}" found in upload file.`);
                continue;
            }
            if (existingDebitNoteNumbers.has(cleanDn)) {
                errors.push(`Row ${rowNum}: Debit Note ID/Number "${debitNoteNumber}" already exists in the database.`);
                continue;
            }
            seenBatchNumbers.add(cleanDn);
        }

        // Tax
        let taxId = undefined;
        const taxRateVal = getRowVal(row, ["Item Tax %", "taxRate", "Tax Rate"]);
        const taxNameVal = getRowVal(row, ["Item Tax", "Tax Name", "taxName", "Tax ID"]);
        if (taxRateVal !== undefined && taxRateVal !== null && taxesByRate.has(Number(taxRateVal))) {
            taxId = taxesByRate.get(Number(taxRateVal))._id;
        } else if (taxNameVal) {
            const cleanT = taxNameVal.toString().trim().toLowerCase();
            if (taxesByName.has(cleanT)) taxId = taxesByName.get(cleanT)._id;
        }

        // Applied Invoice
        let invoiceId = undefined;
        const appliedInvVal = getRowVal(row, ["Applied Invoice Number", "appliedInvoiceNumber", "Invoice Number", "invoiceNumber", "Invoice ID"]);
        if (appliedInvVal) {
            const invToken = appliedInvVal.toString().trim();
            const invDoc = await Invoice.findOne({ invoiceNumber: { $regex: new RegExp(`^${invToken}$`, 'i') } });
            if (!invDoc) {
                errors.push(`Row ${rowNum}: Applied Invoice "${invToken}" was not found; Debit Note created as unlinked.`);
            } else if (['CANCELLED', 'VOID'].includes(invDoc.status)) {
                errors.push(`Row ${rowNum}: Cannot apply Debit Note to ${invDoc.status} Invoice "${invToken}".`);
            } else {
                // If row has customer/driver identified, verify the invoice belongs to them
                if (customerDoc) {
                    const invCustId = (invDoc.customer?._id || invDoc.customer)?.toString();
                    const invDriverId = (invDoc.driver?._id || invDoc.driver)?.toString();
                    const currentCustId = customerDoc._id.toString();
                    const currentDriverId = driverDoc ? driverDoc._id.toString() : (customerDoc.driver ? customerDoc.driver.toString() : null);

                    const matchesCust = invCustId && invCustId === currentCustId;
                    const matchesDriver = currentDriverId && invDriverId && invDriverId === currentDriverId;

                    if (!matchesCust && !matchesDriver) {
                        errors.push(`Row ${rowNum}: Applied Invoice "${invToken}" belongs to a different customer.`);
                    } else {
                        invoiceId = invDoc._id;
                    }
                } else {
                    invoiceId = invDoc._id;
                }
            }
        }

        // Status normalization (Mongoose requires uppercase enum)
        const rawStatus = (getRowVal(row, ["Status", "status", "Debit Note Status"]) || 'PENDING').toString().trim().toUpperCase();
        const VALID_STATUSES = ['DRAFT', 'PENDING', 'PARTIAL', 'PAID', 'OVERDUE', 'CANCELLED', 'OPEN', 'APPLIED', 'CLOSED', 'VOID'];
        const status = VALID_STATUSES.includes(rawStatus) ? rawStatus : 'PENDING';

        try {
            const safeActor = {
                id: (actor && (actor.id || actor._id)) || undefined,
                role: (actor && actor.role ? actor.role.toUpperCase() : 'ADMIN')
            };

            const dnDoc = await createDebitNote({
                debitNoteNumber,
                customerId: customerDoc ? customerDoc._id : undefined,
                supplierId: supplierDoc ? supplierDoc._id : undefined,
                driverId: driverDoc ? driverDoc._id : undefined,
                amount,
                reason,
                notes,
                debitNoteDate,
                isDeposit,
                taxId,
                invoiceId,
                status
            }, safeActor);

            createdNotes.push(dnDoc);
            if (dnDoc.debitNoteNumber) {
                existingDebitNoteNumbers.add(dnDoc.debitNoteNumber.trim().toLowerCase());
            }
        } catch (rowErr) {
            errors.push(`Row ${rowNum}: ${rowErr.message}`);
        }
    }

    return {
        createdCount: createdNotes.length,
        totalRows: rows.length,
        errors,
        createdNotes
    };
};

module.exports = {
    createDebitNote,
    applyDebitNoteToInvoice,
    applyDebitNoteToBill,
    getDebitNotes,
    getDebitNoteById,
    voidDebitNote,
    updateDebitNote,
    bulkUploadDebitNotes
};
