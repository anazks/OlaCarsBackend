const Voucher = require("../Model/VoucherModel");
const LedgerEntry = require("../Model/LedgerEntryModel");
const AccountingCode = require("../../AccountingCode/Model/AccountingCodeModel");
const { create: createLedgerEntry } = require("./LedgerService");
const { 
    autoSetOffInvoices, 
    autoSetOffBills, 
    reverseSetOffFromHistory,
    syncAccountingCodeBalances 
} = require("../../BankAccount/Service/BankAccountService");
const AppError = require("../../../shared/utils/AppError");
const mongoose = require("mongoose");

/**
 * Creates a Voucher and automatically posts it to the Ledger with Auto Set-off support.
 */
exports.createVoucher = async (data) => {
    const { lines, autoSetOff = true, ...voucherData } = data;

    if (!lines || !Array.isArray(lines) || lines.length === 0) {
        throw new AppError("At least one transaction line is required.", 400);
    }

    // Calculate total debits and credits
    let totalDebit = 0;
    let totalCredit = 0;
    lines.forEach(line => {
        const amt = Number(line.amount || 0);
        if (line.type === "DEBIT") totalDebit += amt;
        else if (line.type === "CREDIT") totalCredit += amt;
    });

    const isContraOrJournal = ["JOURNAL", "CONTRA"].includes(voucherData.type);
    if (isContraOrJournal) {
        if (Math.abs(totalDebit - totalCredit) > 0.01) {
            throw new AppError("Total Debits must equal Total Credits for this voucher type.", 400);
        }
    }

    const totalVoucherAmount = totalDebit > 0 ? totalDebit : totalCredit;
    if (totalVoucherAmount <= 0) {
        throw new AppError("Total voucher amount must be greater than zero.", 400);
    }

    // Resolve Contact Info if available
    let contactId = voucherData.contact || (voucherData.referenceInfo ? voucherData.referenceInfo.partyId : null);
    let contactModel = voucherData.contactModel;
    if (!contactModel && voucherData.referenceInfo?.partyType) {
        const pType = voucherData.referenceInfo.partyType.toUpperCase();
        if (pType === "CUSTOMER") contactModel = "Customer";
        else if (pType === "SUPPLIER") contactModel = "Supplier";
        else if (pType === "DRIVER") contactModel = "Driver";
        else contactModel = "Other";
    }

    // 1. Instantiate & Save Voucher Header
    const voucher = new Voucher({
        ...voucherData,
        lines,
        autoSetOff: autoSetOff !== false,
        totalAmount: totalVoucherAmount,
        contact: (contactId && mongoose.Types.ObjectId.isValid(contactId)) ? contactId : undefined,
        contactModel: contactModel || "Other",
        status: "POSTED",
        postedAt: new Date(),
        postedBy: voucherData.createdBy,
        postedByRole: voucherData.creatorRole
    });

    await voucher.save();

    const affectedCodeIds = new Set();
    const createdLedgerEntries = [];

    // --- CASE A: RECEIPT VOUCHER WITH CUSTOMER AUTO SET-OFF ---
    if (voucherData.type === "RECEIPT" && autoSetOff !== false && contactModel === "Customer" && contactId) {
        // Debit line is Bank/Cash account
        const debitLine = lines.find(l => l.type === "DEBIT") || lines[0];
        const bankAccountingCodeId = debitLine.accountingCode;

        // 1. Create Primary Bank/Cash DEBIT Ledger Entry
        const bankEntry = await LedgerEntry.create({
            branch: voucher.branch,
            accountingCode: bankAccountingCodeId,
            type: "DEBIT",
            amount: totalVoucherAmount,
            description: debitLine.description || voucher.narration || "Receipt Voucher Deposit",
            contact: contactId,
            contactModel: "Customer",
            voucher: voucher._id,
            entryDate: voucher.date || new Date(),
            createdBy: voucher.createdBy,
            creatorRole: voucher.creatorRole
        });
        createdLedgerEntries.push(bankEntry);
        affectedCodeIds.add(String(bankAccountingCodeId));

        // 2. Trigger autoSetOffInvoices
        const setOffResult = await autoSetOffInvoices(contactId, totalVoucherAmount, {
            bankAccountingCodeId: bankAccountingCodeId,
            existingBankLedgerEntryId: bankEntry._id,
            primaryLedgerEntry: bankEntry._id,
            branchId: voucher.branch,
            entryDate: voucher.date || new Date(),
            description: voucher.narration || "Receipt Voucher Set-off",
            createdBy: voucher.createdBy,
            creatorRole: voucher.creatorRole
        });

        // 3. Link partner ledger entries created by autoSetOffInvoices to this voucher & update bankEntry
        if (setOffResult) {
            const partnerEntries = await LedgerEntry.find({
                contact: contactId,
                entryDate: voucher.date || new Date(),
                voucher: { $exists: false },
                type: "CREDIT"
            }).sort({ createdAt: -1 }).limit(2);

            for (const pe of partnerEntries) {
                pe.voucher = voucher._id;
                await pe.save();
                createdLedgerEntries.push(pe);
                if (pe.accountingCode) affectedCodeIds.add(String(pe.accountingCode));
            }

            if (setOffResult.invoicesSetOff && setOffResult.invoicesSetOff.length > 0) {
                bankEntry.invoices = setOffResult.invoicesSetOff.map(i => ({
                    invoiceId: i.invoiceId,
                    invoiceNumber: i.invoiceNumber,
                    amountApplied: i.amountApplied
                }));
                if (setOffResult.invoicesSetOff.length === 1) {
                    bankEntry.invoice = setOffResult.invoicesSetOff[0].invoiceId;
                }
            }

            voucher.setOffSummary = {
                totalSetOff: setOffResult.totalSetOff || 0,
                excessAmount: setOffResult.excessAmount || 0,
                invoiceCount: setOffResult.invoicesSetOff?.length || 0,
                itemsSetOff: setOffResult.invoicesSetOff || []
            };
            if (setOffResult.paymentReceived?._id) {
                voucher.paymentReceived = setOffResult.paymentReceived._id;
            }
            await voucher.save();
        }
    }
    // --- CASE B: PAYMENT VOUCHER WITH SUPPLIER AUTO SET-OFF ---
    else if (voucherData.type === "PAYMENT" && autoSetOff !== false && contactModel === "Supplier" && contactId) {
        // Credit line is Bank/Cash account
        const creditLine = lines.find(l => l.type === "CREDIT") || lines[0];
        const bankAccountingCodeId = creditLine.accountingCode;

        // 1. Create Primary Bank/Cash CREDIT Ledger Entry
        const bankEntry = await LedgerEntry.create({
            branch: voucher.branch,
            accountingCode: bankAccountingCodeId,
            type: "CREDIT",
            amount: totalVoucherAmount,
            description: creditLine.description || voucher.narration || "Payment Voucher Withdrawal",
            supplier: contactId,
            contact: contactId,
            contactModel: "Supplier",
            voucher: voucher._id,
            entryDate: voucher.date || new Date(),
            createdBy: voucher.createdBy,
            creatorRole: voucher.creatorRole
        });
        createdLedgerEntries.push(bankEntry);
        affectedCodeIds.add(String(bankAccountingCodeId));

        // 2. Trigger autoSetOffBills
        const setOffResult = await autoSetOffBills(contactId, totalVoucherAmount, {
            bankAccountingCodeId: bankAccountingCodeId,
            existingBankLedgerEntryId: bankEntry._id,
            primaryLedgerEntry: bankEntry._id,
            branchId: voucher.branch,
            entryDate: voucher.date || new Date(),
            description: voucher.narration || "Payment Voucher Bill Set-off",
            createdBy: voucher.createdBy,
            creatorRole: voucher.creatorRole
        });

        // 3. Link partner ledger entries created by autoSetOffBills to this voucher & update bankEntry
        if (setOffResult) {
            const partnerEntries = await LedgerEntry.find({
                supplier: contactId,
                entryDate: voucher.date || new Date(),
                voucher: { $exists: false },
                type: "DEBIT"
            }).sort({ createdAt: -1 }).limit(2);

            for (const pe of partnerEntries) {
                pe.voucher = voucher._id;
                await pe.save();
                createdLedgerEntries.push(pe);
                if (pe.accountingCode) affectedCodeIds.add(String(pe.accountingCode));
            }

            if (setOffResult.billsSetOff && setOffResult.billsSetOff.length > 0) {
                bankEntry.bills = setOffResult.billsSetOff.map(b => ({
                    billId: b.billId,
                    billNumber: b.billNumber,
                    amountApplied: b.amountApplied
                }));
                if (setOffResult.billsSetOff.length === 1) {
                    bankEntry.bill = setOffResult.billsSetOff[0].billId;
                }
            }

            voucher.setOffSummary = {
                totalSetOff: setOffResult.totalSetOff || 0,
                excessAmount: setOffResult.excessAmount || 0,
                billCount: setOffResult.billsSetOff?.length || 0,
                itemsSetOff: setOffResult.billsSetOff || []
            };
            if (setOffResult.vendorPayment?._id) {
                voucher.paymentMade = setOffResult.vendorPayment._id;
            }
            await voucher.save();
        }
    }
    // --- CASE C: GENERAL / STANDARD / MANUAL VOUCHERS ---
    else {
        for (const line of lines) {
            const entry = await createLedgerEntry({
                ...line,
                description: line.description || voucherData.narration,
                voucher: voucher._id,
                branch: voucherData.branch,
                contact: (contactId && mongoose.Types.ObjectId.isValid(contactId)) ? contactId : undefined,
                contactModel: contactModel || "Other",
                entryDate: voucherData.date || new Date(),
                createdBy: voucherData.createdBy,
                creatorRole: voucherData.creatorRole
            });
            createdLedgerEntries.push(entry);
            if (line.accountingCode) {
                affectedCodeIds.add(String(line.accountingCode));
            }
        }
    }

    // Sync accounting code balances
    for (const codeId of affectedCodeIds) {
        if (mongoose.Types.ObjectId.isValid(codeId)) {
            try {
                await syncAccountingCodeBalances(codeId);
            } catch (syncErr) {
                console.error(`[VoucherService] Failed to sync balance for account ${codeId}:`, syncErr);
            }
        }
    }

    return { voucher, ledgerEntries: createdLedgerEntries };
};

/**
 * Retrieves vouchers with filtering and pagination.
 */
exports.getAllVouchers = async (query = {}) => {
    const { page = 1, limit = 20, type, branch, status, startDate, endDate, search } = query;

    const filter = {};
    if (type && type !== 'ALL') filter.type = type;
    if (branch) filter.branch = branch;
    if (status) filter.status = status;
    if (startDate || endDate) {
        filter.date = {};
        if (startDate) filter.date.$gte = new Date(startDate);
        if (endDate) {
            const endD = new Date(endDate);
            endD.setHours(23, 59, 59, 999);
            filter.date.$lte = endD;
        }
    }
    if (search) {
        filter.$or = [
            { voucherNumber: { $regex: search, $options: "i" } },
            { narration: { $regex: search, $options: "i" } },
            { "referenceInfo.partyName": { $regex: search, $options: "i" } },
            { "referenceInfo.referenceNumber": { $regex: search, $options: "i" } }
        ];
    }

    const vouchers = await Voucher.find(filter)
        .sort({ date: -1, createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate("branch", "name code")
        .populate("lines.accountingCode", "name code category")
        .populate("paymentReceived", "paymentNumber amountReceived")
        .populate("paymentMade", "paymentNumber amount");

    const total = await Voucher.countDocuments(filter);

    return {
        vouchers,
        pagination: {
            total,
            page: Number(page),
            limit: Number(limit),
            pages: Math.ceil(total / limit)
        }
    };
};

/**
 * Retrieves a single voucher by ID.
 */
exports.getVoucherById = async (id) => {
    const voucher = await Voucher.findById(id)
        .populate("branch", "name code")
        .populate("lines.accountingCode", "name code category")
        .populate("lines.taxInfo.taxApplied")
        .populate("paymentReceived")
        .populate("paymentMade");

    if (!voucher) {
        throw new AppError("Voucher not found", 404);
    }
    return voucher;
};

/**
 * Cancels / Voids a voucher and restores set-off items / balances.
 */
exports.cancelVoucher = async (id, user) => {
    const voucher = await Voucher.findById(id);
    if (!voucher) {
        throw new AppError("Voucher not found", 404);
    }

    if (voucher.status === "CANCELLED") {
        throw new AppError("This voucher is already cancelled.", 400);
    }

    const affectedCodeIds = new Set();

    // 1. Revert Set-offs if any
    const connectedEntries = await LedgerEntry.find({ voucher: voucher._id });
    for (const ent of connectedEntries) {
        if (ent.accountingCode) affectedCodeIds.add(String(ent.accountingCode));
        try {
            await reverseSetOffFromHistory(ent._id);
        } catch (revErr) {
            console.error(`[cancelVoucher] Failed to reverse set-off for entry ${ent._id}:`, revErr);
        }
    }

    // 2. Delete / Clean up connected Ledger Entries
    await LedgerEntry.deleteMany({ voucher: voucher._id });

    // 3. Mark Voucher as CANCELLED
    voucher.status = "CANCELLED";
    await voucher.save();

    // 4. Sync Accounting Code Balances
    for (const codeId of affectedCodeIds) {
        if (mongoose.Types.ObjectId.isValid(codeId)) {
            try {
                await syncAccountingCodeBalances(codeId);
            } catch (syncErr) {
                console.error(`[cancelVoucher] Failed to sync balance for account ${codeId}:`, syncErr);
            }
        }
    }

    return voucher;
};

/**
 * Retrieves voucher summary statistics.
 */
exports.getVoucherStats = async (query = {}) => {
    const { branch, startDate, endDate } = query;
    const filter = { status: { $ne: "CANCELLED" } };

    if (branch) filter.branch = branch;
    if (startDate || endDate) {
        filter.date = {};
        if (startDate) filter.date.$gte = new Date(startDate);
        if (endDate) {
            const endD = new Date(endDate);
            endD.setHours(23, 59, 59, 999);
            filter.date.$lte = endD;
        }
    }

    const stats = await Voucher.aggregate([
        { $match: filter },
        {
            $group: {
                _id: "$type",
                count: { $sum: 1 },
                totalAmount: { $sum: "$totalAmount" }
            }
        }
    ]);

    const result = {
        totalVouchers: 0,
        totalAmount: 0,
        byType: {
            PAYMENT: { count: 0, totalAmount: 0 },
            RECEIPT: { count: 0, totalAmount: 0 },
            CONTRA: { count: 0, totalAmount: 0 },
            JOURNAL: { count: 0, totalAmount: 0 },
            SALES: { count: 0, totalAmount: 0 },
            PURCHASE: { count: 0, totalAmount: 0 }
        }
    };

    stats.forEach(st => {
        if (result.byType[st._id]) {
            result.byType[st._id] = { count: st.count, totalAmount: st.totalAmount };
        }
        result.totalVouchers += st.count;
        result.totalAmount += st.totalAmount;
    });

    return result;
};
