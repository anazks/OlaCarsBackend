const { createManualJournalRepo } = require("../Repo/ManualJournalRepo");
const { create: createLedgerEntry } = require("./LedgerService");
const LedgerEntry = require("../Model/LedgerEntryModel");
const ManualJournal = require("../Model/ManualJournalModel");
const AccountingCode = require("../../AccountingCode/Model/AccountingCodeModel");
const { 
    autoSetOffInvoices, 
    autoSetOffBills, 
    syncAccountingCodeBalances 
} = require("../../BankAccount/Service/BankAccountService");
const AppError = require("../../../shared/utils/AppError");

/**
 * Creates a Manual Journal and its associated Ledger Entries with Auto Set-off & Category Validations.
 */
exports.createManualJournal = async (data) => {
    const { lines, autoSetOff = false, contact, contactModel, ...journalData } = data;

    if (!lines || !Array.isArray(lines) || lines.length < 2) {
        throw new AppError("A manual journal must contain at least two transaction lines.", 400);
    }

    // 1. Strict Double-Entry Validation: Debits must equal Credits
    let totalDebit = 0;
    let totalCredit = 0;
    for (const line of lines) {
        const amt = Number(line.amount || 0);
        if (isNaN(amt) || amt <= 0) {
            throw new AppError("Each transaction line must have a valid positive amount.", 400);
        }
        if (line.type === "DEBIT") totalDebit += amt;
        else if (line.type === "CREDIT") totalCredit += amt;
        else throw new AppError("Each transaction line must specify type DEBIT or CREDIT.", 400);
    }

    if (Math.abs(totalDebit - totalCredit) > 0.01) {
        throw new AppError(
            `Total Debits must equal Total Credits. Current Debits: $${totalDebit.toFixed(2)}, Credits: $${totalCredit.toFixed(2)}. Difference: $${Math.abs(totalDebit - totalCredit).toFixed(2)}.`,
            400
        );
    }

    const journalTotal = totalDebit;

    // 2. Fetch Accounting Codes to Validate Category Restrictions
    const codeIds = lines.map(l => l.accountingCode);
    const codeDocs = await AccountingCode.find({ _id: { $in: codeIds }, isDeleted: { $ne: true } });
    const codeMap = new Map(codeDocs.map(c => [String(c._id), c]));

    // Check that all codes exist
    for (const line of lines) {
        if (!codeMap.has(String(line.accountingCode))) {
            throw new AppError(`Invalid or deleted accounting code specified: ${line.accountingCode}`, 400);
        }
    }

    // Validation Rules based on Entity Selection:
    if (contactModel === "Customer") {
        for (const line of lines) {
            const code = codeMap.get(String(line.accountingCode));
            const category = String(code.category || "").toUpperCase();
            if (category === "ACCOUNTS PAYABLE" || category.includes("PAYABLE") && !category.includes("TAX")) {
                throw new AppError(
                    `Cannot use Accounts Payable account ("${code.name}") when Customer is selected. For customer transactions, use Accounts Receivable or standard income/asset/bank accounts.`,
                    400
                );
            }
        }
    } else if (contactModel === "Supplier") {
        for (const line of lines) {
            const code = codeMap.get(String(line.accountingCode));
            const category = String(code.category || "").toUpperCase();
            if (category === "ACCOUNTS RECEIVABLE" || category.includes("RECEIVABLE")) {
                throw new AppError(
                    `Cannot use Accounts Receivable account ("${code.name}") when Vendor is selected. For vendor transactions, use Accounts Payable or standard expense/asset/bank accounts.`,
                    400
                );
            }
        }
    }

    // 3. Create Journal Header
    const isCustomer = contactModel === "Customer" && contact;
    const isSupplier = contactModel === "Supplier" && contact;

    const journal = await createManualJournalRepo({
        ...journalData,
        totalAmount: journalTotal,
        contact: isCustomer ? contact : (isSupplier ? contact : undefined),
        contactModel: contactModel || undefined,
        supplier: isSupplier ? contact : undefined,
        autoSetOff: autoSetOff === true,
        status: "POSTED",
        postedAt: new Date(),
        postedBy: journalData.createdBy,
        postedByRole: journalData.creatorRole
    });

    // 4. Create Ledger Entries for each line
    const affectedCodeIds = new Set();
    const ledgerEntries = [];

    for (const line of lines) {
        const sanitizedLine = { ...line };
        if (sanitizedLine.taxInfo) {
            if (!sanitizedLine.taxInfo.taxApplied) {
                delete sanitizedLine.taxInfo;
            } else {
                sanitizedLine.taxInfo = { taxApplied: sanitizedLine.taxInfo.taxApplied };
            }
        }

        const entry = await createLedgerEntry({
            ...sanitizedLine,
            contact: isCustomer ? contact : undefined,
            supplier: isSupplier ? contact : undefined,
            contactModel: contactModel || undefined,
            description: sanitizedLine.description || journalData.description || "Manual Journal Entry",
            manualJournal: journal._id,
            branch: journalData.branch,
            entryDate: journalData.date || new Date(),
            createdBy: journalData.createdBy,
            creatorRole: journalData.creatorRole
        });
        ledgerEntries.push(entry);
        affectedCodeIds.add(String(line.accountingCode));
    }

    // 5. Execute Auto Set-off if enabled
    if (autoSetOff === true && contact) {
        if (isCustomer) {
            // Locate the CREDIT line that represents Accounts Receivable or balancing credit
            const arLine = lines.find(l => {
                const code = codeMap.get(String(l.accountingCode));
                const cat = String(code.category || "").toUpperCase();
                return l.type === "CREDIT" && (cat === "ACCOUNTS RECEIVABLE" || code.code === "1.1.03");
            });
            const setOffAmount = arLine ? Number(arLine.amount) : journalTotal;

            const setOffResult = await autoSetOffInvoices(contact, setOffAmount, {
                branchId: journalData.branch,
                entryDate: journalData.date || new Date(),
                description: journalData.description || `Manual Journal Set-off (${journal.journalNumber})`,
                transactionId: journal.journalNumber,
                createdBy: journalData.createdBy,
                creatorRole: journalData.creatorRole,
                skipLedgerEntries: true // Do not duplicate the already posted credit ledger entry
            });

            if (setOffResult && setOffResult.invoicesSetOff && setOffResult.invoicesSetOff.length > 0) {
                const formattedInvoices = setOffResult.invoicesSetOff.map(i => ({
                    invoiceId: i.invoiceId,
                    invoiceNumber: i.invoiceNumber,
                    amountApplied: i.amountApplied
                }));

                const setOffSummary = {
                    totalSetOff: setOffResult.totalSetOff || 0,
                    excessAmount: setOffResult.excessAmount || 0,
                    invoiceCount: formattedInvoices.length,
                    itemsSetOff: setOffResult.invoicesSetOff || []
                };

                // Update Journal header
                journal.invoices = formattedInvoices;
                journal.setOffSummary = setOffSummary;
                await journal.save();

                // Link to the credit ledger entry
                const creditEntry = ledgerEntries.find(e => {
                    if (arLine) return String(e.accountingCode) === String(arLine.accountingCode) && e.type === "CREDIT";
                    return e.type === "CREDIT";
                }) || ledgerEntries[0];

                if (creditEntry) {
                    await LedgerEntry.updateOne(
                        { _id: creditEntry._id },
                        {
                            $set: {
                                invoices: formattedInvoices,
                                ...(formattedInvoices.length === 1 ? { invoice: formattedInvoices[0].invoiceId } : {}),
                                setOffSummary: setOffSummary
                            }
                        }
                    );
                }
            }
        } else if (isSupplier) {
            // Locate the DEBIT line that represents Accounts Payable or balancing debit
            const apLine = lines.find(l => {
                const code = codeMap.get(String(l.accountingCode));
                const cat = String(code.category || "").toUpperCase();
                return l.type === "DEBIT" && (cat === "ACCOUNTS PAYABLE" || code.code === "2.1.01");
            });
            const setOffAmount = apLine ? Number(apLine.amount) : journalTotal;

            const setOffResult = await autoSetOffBills(contact, setOffAmount, {
                branchId: journalData.branch,
                entryDate: journalData.date || new Date(),
                description: journalData.description || `Manual Journal Bill Set-off (${journal.journalNumber})`,
                transactionId: journal.journalNumber,
                createdBy: journalData.createdBy,
                creatorRole: journalData.creatorRole,
                skipLedgerEntries: true // Do not duplicate the already posted debit ledger entry
            });

            if (setOffResult && setOffResult.billsSetOff && setOffResult.billsSetOff.length > 0) {
                const formattedBills = setOffResult.billsSetOff.map(b => ({
                    billId: b.billId,
                    billNumber: b.billNumber,
                    amountApplied: b.amountApplied
                }));

                const setOffSummary = {
                    totalSetOff: setOffResult.totalSetOff || 0,
                    excessAmount: setOffResult.excessAmount || 0,
                    billCount: formattedBills.length,
                    itemsSetOff: setOffResult.billsSetOff || []
                };

                // Update Journal header
                journal.bills = formattedBills;
                journal.setOffSummary = setOffSummary;
                await journal.save();

                // Link to the debit ledger entry
                const debitEntry = ledgerEntries.find(e => {
                    if (apLine) return String(e.accountingCode) === String(apLine.accountingCode) && e.type === "DEBIT";
                    return e.type === "DEBIT";
                }) || ledgerEntries[0];

                if (debitEntry) {
                    await LedgerEntry.updateOne(
                        { _id: debitEntry._id },
                        {
                            $set: {
                                bills: formattedBills,
                                ...(formattedBills.length === 1 ? { bill: formattedBills[0].billId } : {}),
                                setOffSummary: setOffSummary
                            }
                        }
                    );
                }
            }
        }
    }

    // 6. Recalculate & Synchronize Accounting Code Balances
    for (const codeId of affectedCodeIds) {
        try {
            await syncAccountingCodeBalances(codeId);
        } catch (syncErr) {
            console.error(`[ManualJournalService] Failed to sync balance for account ${codeId}:`, syncErr);
        }
    }

    return { journal, ledgerEntries };
};

/**
 * Bulk creates manual journals from parsed objects or rows with party resolution,
 * double-entry verification, cross-category validation, and auto set-off.
 */
exports.bulkUploadManualJournals = async (payload, actor = {}) => {
    const Branch = require("../../Branch/Model/BranchModel");
    const Customer = require("../../Customer/Model/CustomerModel");
    const Supplier = require("../../Supplier/Model/SupplierModel");

    let journalsToProcess = [];

    if (payload.journals && Array.isArray(payload.journals)) {
        journalsToProcess = payload.journals;
    } else if (payload.rows && Array.isArray(payload.rows)) {
        const grouped = {};
        for (const row of payload.rows) {
            const ref = String(row.reference || row.journalNumber || row.journalDescription || row.description || "MJ-BULK").trim();
            const date = String(row.date || row.journalDate || new Date().toISOString().split("T")[0]).trim();
            const branch = String(row.branch || row.branchName || row.branchCode || "").trim();
            const groupKey = `${ref}__${date}__${branch}`;

            if (!grouped[groupKey]) {
                grouped[groupKey] = {
                    reference: ref,
                    description: row.journalDescription || row.description || ref,
                    date: date,
                    branch: branch,
                    driver: row.driver || row.driverName || row.customer || row.customerName || "",
                    vendor: row.vendor || row.vendorName || row.supplier || row.supplierName || "",
                    autoSetOff: row.autoSetOff !== undefined ? row.autoSetOff : true,
                    lines: []
                };
            }

            const debit = Number(row.debit || row.dr || 0);
            const credit = Number(row.credit || row.cr || 0);
            const type = debit > 0 ? "DEBIT" : (credit > 0 ? "CREDIT" : (row.type ? String(row.type).toUpperCase() : "DEBIT"));
            const amount = debit > 0 ? debit : (credit > 0 ? credit : Number(row.amount || 0));

            grouped[groupKey].lines.push({
                accountingCode: row.accountName || row.account || row.accountCode || row.accountingCode || "",
                type,
                amount,
                description: row.lineDescription || row.memo || row.description || grouped[groupKey].description,
                taxInfo: row.taxName ? { taxApplied: row.taxName } : undefined
            });
        }
        journalsToProcess = Object.values(grouped);
    } else if (Array.isArray(payload)) {
        journalsToProcess = payload;
    } else {
        throw new AppError("Invalid payload. Expected 'journals' or 'rows' array.", 400);
    }

    if (journalsToProcess.length === 0) {
        throw new AppError("No manual journal entries found to process.", 400);
    }

    // Pre-load reference maps for fast O(1) resolution
    const [allBranches, allCodes, allCustomers, allSuppliers] = await Promise.all([
        Branch.find({ isDeleted: false }).lean(),
        AccountingCode.find({ isDeleted: false }).lean(),
        Customer.find({ isDeleted: false }).populate("driver").lean(),
        Supplier.find({ isDeleted: false }).lean()
    ]);

    // Branch Maps
    const branchMap = new Map();
    allBranches.forEach(b => {
        branchMap.set(String(b._id), b._id);
        if (b.name) branchMap.set(b.name.trim().toLowerCase(), b._id);
        if (b.code) branchMap.set(b.code.trim().toLowerCase(), b._id);
    });

    // Account Code Maps
    const codeMap = new Map();
    allCodes.forEach(c => {
        codeMap.set(String(c._id), c._id);
        if (c.code) codeMap.set(c.code.trim().toLowerCase(), c._id);
        if (c.name) codeMap.set(c.name.trim().toLowerCase(), c._id);
    });

    // Customer / Driver Maps
    const customerMap = new Map();
    allCustomers.forEach(c => {
        customerMap.set(String(c._id), c._id);
        if (c.name) customerMap.set(c.name.trim().toLowerCase(), c._id);
        if (c.customerNumber) customerMap.set(c.customerNumber.trim().toLowerCase(), c._id);
        if (c.driver) {
            if (c.driver.name) customerMap.set(c.driver.name.trim().toLowerCase(), c._id);
            if (c.driver.driverId) customerMap.set(c.driver.driverId.trim().toLowerCase(), c._id);
        }
        if (c.phone) customerMap.set(c.phone.trim(), c._id);
        if (c.email) customerMap.set(c.email.trim().toLowerCase(), c._id);
    });

    // Supplier / Vendor Maps
    const supplierMap = new Map();
    allSuppliers.forEach(s => {
        supplierMap.set(String(s._id), s._id);
        if (s.name) supplierMap.set(s.name.trim().toLowerCase(), s._id);
        if (s.companyName) supplierMap.set(s.companyName.trim().toLowerCase(), s._id);
        if (s.vendorNumber) supplierMap.set(s.vendorNumber.trim().toLowerCase(), s._id);
        if (s.supplierNumber) supplierMap.set(s.supplierNumber.trim().toLowerCase(), s._id);
        if (s.phone) supplierMap.set(s.phone.trim(), s._id);
        if (s.email) supplierMap.set(s.email.trim().toLowerCase(), s._id);
    });

    const defaultBranchId = actor.branchId || (allBranches.length > 0 ? allBranches[0]._id : null);

    const createdJournals = [];
    const failedJournals = [];

    for (let i = 0; i < journalsToProcess.length; i++) {
        const j = journalsToProcess[i];
        const jRef = j.reference || j.journalNumber || j.description || `Journal #${i + 1}`;

        try {
            // Resolve Branch
            let resolvedBranchId = defaultBranchId;
            if (j.branch) {
                const bKey = String(j.branch).trim().toLowerCase();
                resolvedBranchId = branchMap.get(bKey) || branchMap.get(String(j.branch).trim()) || defaultBranchId;
            }

            if (!resolvedBranchId) {
                throw new Error(`Branch "${j.branch || 'N/A'}" could not be resolved.`);
            }

            // Resolve Driver vs Vendor
            const hasDriver = Boolean(j.driver && String(j.driver).trim());
            const hasVendor = Boolean(j.vendor && String(j.vendor).trim());

            if (hasDriver && hasVendor) {
                throw new Error("Cannot assign both Driver and Vendor to the same manual journal entry.");
            }

            let resolvedContact = undefined;
            let resolvedContactModel = undefined;

            if (hasDriver) {
                const dKey = String(j.driver).trim().toLowerCase();
                const matchedCustId = customerMap.get(dKey) || customerMap.get(String(j.driver).trim());
                if (!matchedCustId) {
                    throw new Error(`Driver / Customer "${j.driver}" not found in system.`);
                }
                resolvedContact = matchedCustId;
                resolvedContactModel = "Customer";
            } else if (hasVendor) {
                const vKey = String(j.vendor).trim().toLowerCase();
                const matchedSuppId = supplierMap.get(vKey) || supplierMap.get(String(j.vendor).trim());
                if (!matchedSuppId) {
                    throw new Error(`Vendor / Supplier "${j.vendor}" not found in system.`);
                }
                resolvedContact = matchedSuppId;
                resolvedContactModel = "Supplier";
            }

            // Resolve Auto Set-off: Automatically true if driver or vendor is assigned
            let resolvedAutoSetOff = Boolean(resolvedContactModel);
            if (resolvedContactModel && j.autoSetOff !== undefined) {
                if (typeof j.autoSetOff === "boolean") {
                    resolvedAutoSetOff = j.autoSetOff;
                } else if (typeof j.autoSetOff === "string") {
                    const cleanStr = j.autoSetOff.trim().toUpperCase();
                    if (cleanStr === "NO" || cleanStr === "FALSE" || cleanStr === "0") {
                        resolvedAutoSetOff = false;
                    }
                }
            }

            // Resolve Lines
            if (!j.lines || !Array.isArray(j.lines) || j.lines.length < 2) {
                throw new Error("Journal entry must have at least 2 lines (at least one Debit and one Credit).");
            }

            const resolvedLines = [];
            for (let lIdx = 0; lIdx < j.lines.length; lIdx++) {
                const l = j.lines[lIdx];
                const rawCode = String(l.accountingCode || "").trim();
                let resolvedCodeId = codeMap.get(rawCode.toLowerCase()) || codeMap.get(rawCode);

                if (!resolvedCodeId) {
                    const term = rawCode.toLowerCase();
                    const matchedCode = allCodes.find(c => {
                        const cName = (c.name || "").toLowerCase();
                        return cName.includes(term) || term.includes(cName);
                    });
                    if (matchedCode) resolvedCodeId = matchedCode._id;
                }

                if (!resolvedCodeId) {
                    throw new Error(`Line ${lIdx + 1}: Account "${rawCode}" could not be found in Chart of Accounts.`);
                }

                resolvedLines.push({
                    accountingCode: resolvedCodeId,
                    type: String(l.type || "DEBIT").toUpperCase(),
                    amount: Number(l.amount || 0),
                    description: l.description || j.description || jRef,
                    taxInfo: l.taxInfo
                });
            }

            // Execute creation
            const createPayload = {
                description: j.description || jRef,
                date: j.date || new Date().toISOString().split("T")[0],
                branch: resolvedBranchId,
                lines: resolvedLines,
                contact: resolvedContact,
                contactModel: resolvedContactModel,
                autoSetOff: resolvedAutoSetOff,
                createdBy: actor.id,
                creatorRole: actor.role
            };

            const result = await exports.createManualJournal(createPayload);
            createdJournals.push({
                reference: jRef,
                journalId: result.journal._id,
                journalNumber: result.journal.journalNumber,
                amount: result.journal.totalAmount,
                contactModel: resolvedContactModel,
                autoSetOff: resolvedAutoSetOff,
                invoicesSettled: result.journal.invoices?.length || 0,
                billsSettled: result.journal.bills?.length || 0
            });
        } catch (err) {
            failedJournals.push({
                reference: jRef,
                error: err.message || "Failed to create journal"
            });
        }
    }

    return {
        success: failedJournals.length === 0,
        totalCount: journalsToProcess.length,
        createdCount: createdJournals.length,
        failedCount: failedJournals.length,
        createdJournals,
        errors: failedJournals
    };
};

