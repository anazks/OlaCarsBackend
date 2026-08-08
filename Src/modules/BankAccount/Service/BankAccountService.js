const mongoose = require("mongoose");
const BankAccount = require("../Model/BankAccountModel");
const AccountingCode = require("../../AccountingCode/Model/AccountingCodeModel");
const AppError = require("../../../shared/utils/AppError");

const escapeRegExp = (string) => {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

const ensureDateTimeWithCurrentTime = (dateInput) => {
    if (!dateInput) return new Date();
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return new Date();

    // If date is midnight (00:00:00.000, like YYYY-MM-DD input from datepicker), inject current time of day
    if (d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0) {
        const now = new Date();
        d.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds());
    }
    return d;
};

const ensureSubAccountingCode = async (parentAccountVal, accountsNameVal, creatorId, creatorRole, supplierDoc = null) => {
    const mongoose = require("mongoose");
    let parentName = String(parentAccountVal || "").trim();
    const subName = String(accountsNameVal || "").trim();

    const searchTarget = subName || parentName;
    if (!searchTarget) return null;

    const cleanTarget = searchTarget.replace(/\u00a0/g, ' ').replace(/[\/\\_-]/g, ' ').replace(/\s+/g, ' ').trim();
    const escapedTarget = escapeRegExp(cleanTarget);

    // 0. Check if searchTarget matches any system Bank Account (Inter-Bank Transfer)
    try {
        const BankAccount = require("../Model/BankAccountModel");
        let bankAccDoc = await BankAccount.findOne({
            $or: [
                { accountName: { $regex: new RegExp(`^${escapedTarget}$`, "i") } },
                { bankName: { $regex: new RegExp(`^${escapedTarget}$`, "i") } },
                { accountNumber: { $regex: new RegExp(`^${escapedTarget}$`, "i") } }
            ],
            isDeleted: { $ne: true }
        }).populate("accountingCode");

        if (!bankAccDoc && cleanTarget.includes(' ')) {
            const tokens = cleanTarget.split(' ').filter(Boolean);
            const tokenRegexes = tokens.map(t => new RegExp(escapeRegExp(t), 'i'));
            bankAccDoc = await BankAccount.findOne({
                $and: [
                    { isDeleted: { $ne: true } },
                    {
                        $or: [
                            { $and: tokenRegexes.map(r => ({ accountName: r })) },
                            { $and: tokenRegexes.map(r => ({ bankName: r })) },
                            { $and: tokenRegexes.map(r => ({ accountNumber: r })) }
                        ]
                    }
                ]
            }).populate("accountingCode");
        }

        if (bankAccDoc && bankAccDoc.accountingCode) {
            return typeof bankAccDoc.accountingCode === 'object' ? bankAccDoc.accountingCode : await AccountingCode.findById(bankAccDoc.accountingCode);
        }
    } catch (bankLookupErr) {
        console.error("Error matching BankAccount in ensureSubAccountingCode:", bankLookupErr);
    }

    // 1. Direct match on code, _id, or exact name in Chart of Accounts
    let parentDoc = await AccountingCode.findOne({
        $or: [
            { code: searchTarget },
            { code: cleanTarget },
            { _id: mongoose.Types.ObjectId.isValid(searchTarget) ? searchTarget : null },
            { name: { $regex: new RegExp(`^${escapedTarget}$`, "i") } }
        ],
        isDeleted: false
    });

    // 2. Substring match on AccountingCode name
    if (!parentDoc) {
        parentDoc = await AccountingCode.findOne({
            name: { $regex: new RegExp(escapedTarget, "i") },
            isDeleted: false
        });
    }

    // 3. Multi-word token search (e.g. "Banco", "General", "AH", "1601")
    if (!parentDoc && cleanTarget.includes(' ')) {
        const tokens = cleanTarget.split(' ').filter(Boolean);
        const tokenRegexes = tokens.map(t => new RegExp(escapeRegExp(t), 'i'));
        parentDoc = await AccountingCode.findOne({
            $and: tokenRegexes.map(r => ({ name: r })),
            isDeleted: false
        });
    }

    // 4. Key/Category fallbacks (Receivable / Payable / etc.)
    if (!parentDoc) {
        const lower = cleanTarget.toLowerCase();
        let fallbackCode = null;
        if (lower.includes("payable") || lower.includes("pagar")) {
            fallbackCode = "2.1.01";
        } else if (lower.includes("receivable") || lower.includes("cobrar")) {
            fallbackCode = "1.1.03";
        }
        if (fallbackCode) {
            parentDoc = await AccountingCode.findOne({
                code: fallbackCode,
                isDeleted: false
            });
        }
    }

    // 5. Default fallbacks if account still not found
    if (!parentDoc) {
        const isSupplierOrPayable = Boolean(supplierDoc) || searchTarget.toLowerCase().includes("payable") || searchTarget.toLowerCase().includes("pagar");
        const defaultCode = isSupplierOrPayable ? "2.1.01" : "1.1.03";
        parentDoc = await AccountingCode.findOne({
            code: defaultCode,
            isDeleted: false
        });
    }

    if (!parentDoc) {
        parentDoc = await AccountingCode.findOne({
            parentAccount: null,
            isDeleted: false
        });
    }

    if (!parentDoc) {
        throw new AppError("Accounting code for '" + searchTarget + "' could not be resolved in Chart of Accounts.", 400);
    }

    return parentDoc;
};

const isDebitNormalCategory = (category) => {
    const cat = String(category).toUpperCase();
    return [
        "CASH", "BANK", "ACCOUNTS RECEIVABLE", "FIXED ASSET", "OTHER CURRENT ASSET",
        "OTHER ASSET", "STOCK", "EXPENSE", "COST OF GOODS SOLD", "OTHER EXPENSE", "INPUT TAX",
        "ASSET"
    ].includes(cat);
};

const syncAccountingCodeBalances = async (accountingCodeId) => {
    const LedgerEntry = require("../../Ledger/Model/LedgerEntryModel");
    const AccountingCode = require("../../AccountingCode/Model/AccountingCodeModel");

    const result = await LedgerEntry.aggregate([
        { $match: { accountingCode: new mongoose.Types.ObjectId(accountingCodeId) } },
        {
            $group: {
                _id: null,
                debitTotal: {
                    $sum: { $cond: [{ $eq: ["$type", "DEBIT"] }, "$amount", 0] }
                },
                creditTotal: {
                    $sum: { $cond: [{ $eq: ["$type", "CREDIT"] }, "$amount", 0] }
                }
            }
        }
    ]);

    const debitTotal = result.length > 0 ? result[0].debitTotal : 0;
    const creditTotal = result.length > 0 ? result[0].creditTotal : 0;

    const codeDoc = await AccountingCode.findById(accountingCodeId);
    if (codeDoc) {
        codeDoc.debitTotal = debitTotal;
        codeDoc.creditTotal = creditTotal;
        const isDebit = isDebitNormalCategory(codeDoc.category);
        codeDoc.currentBalance = isDebit ? (debitTotal - creditTotal) : (creditTotal - debitTotal);
        await codeDoc.save();
        console.log(`[BankAccountService] Synced AccountingCode ${codeDoc.code}: debitTotal=${debitTotal}, creditTotal=${creditTotal}, currentBalance=${codeDoc.currentBalance}`);
    }
};


const ensureAccountingCode = async (data) => {
    if (!data.accountCode) return null;

    // Check if the accounting code already exists
    let codeDoc = await AccountingCode.findOne({ code: data.accountCode, isDeleted: false });

    if (!codeDoc) {
        console.log(`[BankAccountService] Creating new AccountingCode for code ${data.accountCode}`);

        // Define category and account type based on accountType
        let category = "ASSET";
        let accountType = "Bank";
        if (data.accountType === "Credit Card") {
            category = "LIABILITY";
            accountType = "Other Current Liability";
        } else if (data.accountType === "Cash") {
            category = "ASSET";
            accountType = "Cash";
        }

        // Normalize role for validation constraint
        let role = (data.creatorRole || "ADMIN").toUpperCase();
        if (role === "FINANCIALADMIN" || role === "FINANCEADMIN" || role === "FINANCE_ADMIN") {
            role = "FINANCEADMIN";
        } else if (role !== "ADMIN" && role !== "FINANCEADMIN") {
            role = "ADMIN";
        }

        // Create the new accounting code
        codeDoc = await AccountingCode.create({
            code: data.accountCode,
            name: data.accountName || data.bankName,
            category: category,
            accountType: accountType,
            description: data.description || `Auto-created for bank account ${data.accountNumber}`,
            currency: data.currency || "USD",
            accountNumber: data.accountNumber,
            accountStatus: "Active",
            createdBy: data.createdBy,
            creatorRole: role
        });
    } else {
        // If it exists, update its name with the bank account's accountName (or bankName)
        console.log(`[BankAccountService] Updating existing AccountingCode name for code ${data.accountCode}`);
        codeDoc.name = data.accountName || data.bankName;
        // Keep other details in sync if provided
        if (data.currency) codeDoc.currency = data.currency;
        if (data.accountNumber) codeDoc.accountNumber = data.accountNumber;
        await codeDoc.save();
    }

    return codeDoc._id;
};

const createBankAccount = async (data) => {
    try {
        console.log("[BankAccountService] Creating account with data:", data);

        // Auto create & link AccountingCode
        const accountingCodeId = await ensureAccountingCode(data);
        if (accountingCodeId) {
            data.accountingCode = accountingCodeId;
        }

        const account = new BankAccount(data);
        return await account.save();
    } catch (error) {
        console.error("[BankAccountService] Save failed:", error.message);
        if (error.name === 'ValidationError') {
            const messages = Object.values(error.errors).map(err => err.message);
            throw new AppError(`Validation failed: ${messages.join(', ')}`, 400);
        }
        if (error.code === 11000) {
            throw new AppError("Account number already exists", 400);
        }
        throw error;
    }
};

const { applyQueryFeatures } = require("../../../shared/utils/queryHelper");

const syncMissingBankAccounts = async () => {
    const codes = await AccountingCode.find({
        accountType: { $in: ["Bank", "Cash"] },
        isDeleted: false
    });
    for (const code of codes) {
        // Parse unique account number
        const numMatch = code.name.match(/\d+/);
        const rawNum = numMatch ? numMatch[0] : 'ACC';
        const accountNumber = `${rawNum}-${code.code.replace(/[\.\-\(\)\s]/g, '')}`;

        // Check if there is an existing bank account by code, id, or accountNumber
        let existing = await BankAccount.findOne({
            $or: [
                { accountCode: code.code },
                { accountingCode: code._id },
                { accountNumber: accountNumber }
            ]
        });

        if (!existing) {
            console.log(`[BankAccountService] Auto-creating missing BankAccount for code ${code.code}`);

            // Parse bankName
            let bankName = 'Ola Bank';
            if (code.accountType === 'Cash') {
                bankName = 'Cash Account';
            } else if (code.name.toLowerCase().includes('banco general')) {
                bankName = 'Banco General';
            } else if (code.name.toLowerCase().includes('bct')) {
                bankName = 'BCT Bank';
            } else if (code.name.toLowerCase().includes('canal bank')) {
                bankName = 'Canal Bank';
            } else if (code.name.toLowerCase().includes('bi bank')) {
                bankName = 'BI Bank';
            } else if (code.name.toLowerCase().includes('arrendadora')) {
                bankName = 'Arrendadora Ola Cars';
            }

            await BankAccount.create({
                bankName,
                accountNumber,
                accountHolderName: 'Ola Cars Corporate',
                swiftCode: 'OLAUS33XXX',
                ifscCode: 'OLAUS33XXX',
                branchName: 'Panama HQ',
                currency: code.currency || 'USD',
                initialBalance: 0,
                currentBalance: 0,
                status: 'ACTIVE',
                accountType: code.accountType === 'Cash' ? 'Cash' : 'Bank',
                accountName: code.name,
                accountCode: code.code,
                description: `Auto-created from Chart of Accounts for code ${code.code}`,
                accountingCode: code._id
            });
        } else {
            // Link if not already linked
            let updated = false;
            if (!existing.accountingCode) {
                existing.accountingCode = code._id;
                updated = true;
            }
            if (!existing.accountCode) {
                existing.accountCode = code.code;
                updated = true;
            }
            if (code.accountType === 'Cash' && existing.accountType !== 'Cash') {
                existing.accountType = 'Cash';
                updated = true;
            }
            if (updated) {
                await existing.save();
                console.log(`[BankAccountService] Linked existing BankAccount ${existing.accountName} with AccountingCode ${code.code}`);
            }
        }
    }
};

const getAllBankAccounts = async (queryParams = {}) => {
    // Run auto-sync asynchronously in the background so it doesn't block the API response
    syncMissingBankAccounts().catch(err => {
        console.error("[BankAccountService] Error in background auto-syncing BankAccounts:", err);
    });

    const queryOptions = {
        searchFields: ["bankName", "accountNumber", "accountHolderName", "branchName", "accountName", "accountCode"],
        filterFields: ["status", "currency", "accountType"],
        dateFilterField: "createdAt",
        baseQuery: { isDeleted: false },
        defaultSort: { createdAt: -1 }
    };
    const result = await applyQueryFeatures(BankAccount, queryParams, queryOptions);

    // Calculate dynamic balance directly from LedgerEntry for each bank account
    const LedgerEntry = require("../../Ledger/Model/LedgerEntryModel");
    const updatedData = await Promise.all(result.data.map(async (account) => {
        const accObject = account.toObject ? account.toObject() : account;
        const codeId = account.accountingCode
            ? (account.accountingCode._id || account.accountingCode)
            : null;

        if (codeId) {
            const ledgerAgg = await LedgerEntry.aggregate([
                { $match: { accountingCode: new mongoose.Types.ObjectId(codeId) } },
                {
                    $group: {
                        _id: null,
                        debitTotal: { $sum: { $cond: [{ $eq: ["$type", "DEBIT"] }, "$amount", 0] } },
                        creditTotal: { $sum: { $cond: [{ $eq: ["$type", "CREDIT"] }, "$amount", 0] } },
                        count: { $sum: 1 }
                    }
                }
            ]);

            const debitTotal = ledgerAgg.length > 0 ? ledgerAgg[0].debitTotal : 0;
            const creditTotal = ledgerAgg.length > 0 ? ledgerAgg[0].creditTotal : 0;
            const ledgerCount = ledgerAgg.length > 0 ? ledgerAgg[0].count : 0;

            const initialBal = Number(account.initialBalance || 0);
            accObject.currentBalance = initialBal + debitTotal - creditTotal;
            accObject.transactionCount = ledgerCount;
        } else {
            accObject.currentBalance = Number(account.initialBalance || 0);
            accObject.transactionCount = 0;
        }
        return accObject;
    }));

    result.data = updatedData;
    return result;
};

const getBankAccountById = async (id) => {
    const account = await BankAccount.findOne({ _id: id, isDeleted: false }).populate("accountingCode");
    if (!account) throw new AppError("Bank account not found", 404);

    const LedgerEntry = require("../../Ledger/Model/LedgerEntryModel");
    const accObject = account.toObject();
    const codeId = account.accountingCode
        ? (account.accountingCode._id || account.accountingCode)
        : null;

    if (codeId) {
        const ledgerAgg = await LedgerEntry.aggregate([
            { $match: { accountingCode: new mongoose.Types.ObjectId(codeId) } },
            {
                $group: {
                    _id: null,
                    debitTotal: { $sum: { $cond: [{ $eq: ["$type", "DEBIT"] }, "$amount", 0] } },
                    creditTotal: { $sum: { $cond: [{ $eq: ["$type", "CREDIT"] }, "$amount", 0] } },
                    count: { $sum: 1 }
                }
            }
        ]);

        const debitTotal = ledgerAgg.length > 0 ? ledgerAgg[0].debitTotal : 0;
        const creditTotal = ledgerAgg.length > 0 ? ledgerAgg[0].creditTotal : 0;
        const ledgerCount = ledgerAgg.length > 0 ? ledgerAgg[0].count : 0;

        const initialBal = Number(account.initialBalance || 0);
        accObject.currentBalance = initialBal + debitTotal - creditTotal;
        accObject.transactionCount = ledgerCount;
    } else {
        accObject.currentBalance = Number(account.initialBalance || 0);
        accObject.transactionCount = 0;
    }
    return accObject;
};

const updateBankAccount = async (id, data) => {
    // Auto create & link AccountingCode
    const accountingCodeId = await ensureAccountingCode(data);
    if (accountingCodeId) {
        data.accountingCode = accountingCodeId;
    }

    // Get the old bank account first to compare initialBalance
    const oldAccount = await BankAccount.findOne({ _id: id, isDeleted: false });
    if (!oldAccount) throw new AppError("Bank account not found", 404);

    if (data.initialBalance !== undefined) {
        const delta = Number(data.initialBalance) - Number(oldAccount.initialBalance || 0);
        data.currentBalance = Number(oldAccount.currentBalance || 0) + delta;
    }

    const account = await BankAccount.findOneAndUpdate(
        { _id: id, isDeleted: false },
        data,
        { new: true, runValidators: true }
    ).populate("accountingCode");

    if (!account) throw new AppError("Bank account not found", 404);

    const LedgerEntry = require("../../Ledger/Model/LedgerEntryModel");
    const BankTransaction = require("../Model/BankTransactionModel");
    const accObject = account.toObject();
    const codeId = account.accountingCode
        ? (account.accountingCode._id || account.accountingCode)
        : null;

    const ledgerCount = codeId ? await LedgerEntry.countDocuments({ accountingCode: codeId }) : 0;
    const bankTxCount = await BankTransaction.countDocuments({ bankAccount: account._id });
    accObject.transactionCount = ledgerCount + bankTxCount;
    return accObject;
};

const deleteBankAccount = async (id) => {
    const account = await BankAccount.findOneAndUpdate(
        { _id: id, isDeleted: false },
        { isDeleted: true },
        { new: true }
    );
    if (!account) throw new AppError("Bank account not found", 404);
    return account;
};

const updateBalance = async (id, amountChange) => {
    const account = await BankAccount.findOneAndUpdate(
        { _id: id, isDeleted: false },
        { $inc: { currentBalance: amountChange } },
        { new: true }
    );
    if (!account) throw new AppError("Bank account not found", 404);
    return account;
};

const importStatement = async (id, options) => {
    const { branchId, transactions, userId, userRole } = options;

    const account = await BankAccount.findOne({ _id: id, isDeleted: false });
    if (!account) throw new AppError("Bank account not found", 404);

    if (!account.accountingCode) {
        throw new AppError("Bank account is not linked to any accounting code", 400);
    }

    const ManualJournalService = require("../../Ledger/Service/ManualJournalService");
    const arCodeDoc = await AccountingCode.findOne({
        $or: [
            { code: "1.1.03" },
            { code: "1200" },
            { name: { $regex: /Accounts Receivable/i } },
            { name: { $regex: /Cuenta por Cobrar/i } }
        ],
        isDeleted: { $ne: true }
    });

    let totalBalanceChange = 0;
    let importedCount = 0;

    let finalRole = (userRole || "ADMIN").toUpperCase();
    const { ROLES } = require("../../../shared/constants/roles");
    if (!Object.values(ROLES).includes(finalRole)) {
        finalRole = "ADMIN";
    }

    for (const tx of transactions) {
        const { date, type, amount, description, referenceNumber, payee } = tx;

        if (!type || (type !== "DEBIT" && type !== "CREDIT")) {
            throw new AppError(`Invalid transaction type: ${type}. Must be DEBIT or CREDIT.`, 400);
        }

        const numericAmount = Number(amount);
        if (isNaN(numericAmount) || numericAmount <= 0) {
            throw new AppError(`Invalid transaction amount: ${amount}. Must be a positive number.`, 400);
        }

        const txRef = referenceNumber || `TX-${Date.now()}-${Math.floor(Math.random() * 100000)}`;

        // 1. Primary Bank Ledger Entry
        await LedgerEntry.create({
            branch: branchId,
            accountingCode: account.accountingCode,
            type,
            amount: numericAmount,
            description: `${description || 'Bank transaction'}${payee ? ` - Payee: ${payee}` : ''}`,
            entryDate: date ? new Date(date) : new Date(),
            transactionId: txRef,
            createdBy: userId,
            creatorRole: finalRole
        });

        // 2. Offsetting Partner Ledger Entry
        await LedgerEntry.create({
            branch: branchId,
            accountingCode: arCodeDoc ? arCodeDoc._id : account.accountingCode,
            type: type === "DEBIT" ? "CREDIT" : "DEBIT",
            amount: numericAmount,
            description: `${description || 'Bank transaction offset'}${payee ? ` - Payee: ${payee}` : ''}`,
            entryDate: date ? new Date(date) : new Date(),
            transactionId: txRef,
            createdBy: userId,
            creatorRole: finalRole
        });

        let balanceChange = 0;
        if (account.accountType === "Credit Card") {
            balanceChange = type === "DEBIT" ? -numericAmount : numericAmount;
        } else {
            balanceChange = type === "DEBIT" ? numericAmount : -numericAmount;
        }

        totalBalanceChange += balanceChange;
        importedCount++;
    }

    account.currentBalance = Number(account.currentBalance || 0) + totalBalanceChange;
    await account.save();

    try {
        await recalculateRunningBalances(account._id);
    } catch (recalcErr) {
        console.error("Failed to recalculate running balances after import statement:", recalcErr);
    }

    return {
        importedCount,
        newBalance: account.currentBalance
    };
};

const recordManualPayment = async (targetId, data) => {
    const {
        amount,
        depositDate,
        paymentMode,
        description,
        currency,
        fromAccountId,
        toAccountId,
        branchId,
        supportingDocument,
        userId,
        userRole,
        customerId,
        invoiceId,
        entryType = "RECEIPT"
    } = data;

    const normalizedEntryType = String(entryType).toUpperCase();
    const targetAccount = await BankAccount.findOne({ _id: targetId, isDeleted: false });
    if (!targetAccount) throw new AppError("Target bank account not found", 404);

    const numericAmount = Number(amount);
    if (isNaN(numericAmount) || numericAmount <= 0) {
        throw new AppError("Amount must be a positive number", 400);
    }

    const ManualJournalService = require("../../Ledger/Service/ManualJournalService");
    const AccountingCode = require("../../AccountingCode/Model/AccountingCodeModel");

    let finalRole = (userRole || "ADMIN").toUpperCase();
    const { ROLES } = require("../../../shared/constants/roles");
    if (!Object.values(ROLES).includes(finalRole)) {
        finalRole = "ADMIN";
    }

    let finalBranchId = branchId;
    if (!finalBranchId) {
        const Branch = require("../../Branch/Model/BranchModel");
        const defaultBranch = await Branch.findOne({ isDeleted: false });
        if (defaultBranch) {
            finalBranchId = defaultBranch._id;
        } else {
            throw new AppError("No active branch found in the system. A branch is required to record ledger transactions.", 400);
        }
    }

    const parsedDate = (() => {
        if (!depositDate) return new Date();
        const dateParts = String(depositDate).split("-");
        if (dateParts.length === 3) {
            const year = parseInt(dateParts[0], 10);
            const month = parseInt(dateParts[1], 10) - 1;
            const day = parseInt(dateParts[2], 10);
            const d = new Date();
            d.setFullYear(year, month, day);
            return d;
        }
        return new Date(depositDate);
    })();

    const cleanCustomerId = (customerId && customerId !== "undefined" && customerId !== "null" && String(customerId).trim() !== "") ? String(customerId).trim() : null;
    const cleanInvoiceId = (invoiceId && invoiceId !== "undefined" && invoiceId !== "null" && String(invoiceId).trim() !== "") ? String(invoiceId).trim() : null;

    // -------------------------------------------------------------
    // CASE A: RECEIPT WITH CUSTOMER & NO SPECIFIC INVOICE (Auto Set-off)
    // -------------------------------------------------------------
    if (normalizedEntryType === "RECEIPT" && cleanCustomerId && !cleanInvoiceId) {
        const setOffResult = await autoSetOffInvoices(cleanCustomerId, numericAmount, {
            bankAccountingCodeId: targetAccount.accountingCode,
            branchId: finalBranchId,
            entryDate: parsedDate,
            description: description || `Manual Payment Received from Customer`,
            createdBy: userId,
            creatorRole: finalRole
        });

        // Update target bank account balance (DEBIT: Money In)
        let targetBalanceChange = targetAccount.accountType === "Credit Card" ? -numericAmount : numericAmount;
        targetAccount.currentBalance = Number(targetAccount.currentBalance || 0) + targetBalanceChange;
        await targetAccount.save();

        try {
            await recalculateRunningBalances(targetAccount._id);
        } catch (recalcErr) {
            console.error("Failed to recalculate running balances after customer receipt auto set-off:", recalcErr);
        }

        return {
            success: true,
            setOffResult,
            targetNewBalance: targetAccount.currentBalance
        };
    }

    // -------------------------------------------------------------
    // CASE B: OTHER RECEIPTS OR PAYMENTS (requires offset Account or Specific Invoice)
    // -------------------------------------------------------------
    const cleanOffsetAccountId = (toAccountId && toAccountId !== "undefined" && toAccountId !== "null" && String(toAccountId).trim() !== "") ? String(toAccountId).trim() : ((fromAccountId && fromAccountId !== "undefined" && fromAccountId !== "null" && String(fromAccountId).trim() !== "") ? String(fromAccountId).trim() : null);
    let offsetAccount = null;
    let offsetAccountingCode = null;

    if (cleanOffsetAccountId) {
        // First check if cleanOffsetAccountId is a BankAccount
        offsetAccount = await BankAccount.findOne({ _id: cleanOffsetAccountId, isDeleted: false });
        if (offsetAccount) {
            offsetAccountingCode = offsetAccount.accountingCode;
        } else {
            // Check if cleanOffsetAccountId is directly an AccountingCode ID
            const accCodeDoc = await AccountingCode.findOne({ _id: cleanOffsetAccountId, isDeleted: false });
            if (accCodeDoc) {
                offsetAccountingCode = accCodeDoc._id;
            }
        }
    }

    // If Customer Receipt, automatically route to Accounts Receivable (1.1.03) if offset accounting code not explicitly selected
    if (normalizedEntryType === "RECEIPT" && (cleanCustomerId || cleanInvoiceId)) {
        if (!offsetAccountingCode) {
            const arAccount = await AccountingCode.findOne({ code: "1.1.03" })
                || await AccountingCode.findOne({ code: "1100" })
                || await AccountingCode.findOne({ code: "1200" })
                || await AccountingCode.findOne({ category: "Accounts Receivable" });
            if (arAccount) {
                offsetAccountingCode = arAccount._id;
            }
        }
    }

    if (!targetAccount.accountingCode) {
        throw new AppError("Target bank account is not linked to any accounting code", 400);
    }
    if (!offsetAccountingCode) {
        throw new AppError("Destination / Offset account is required and must have a valid accounting code", 400);
    }

    let invoiceDoc = null;
    if (invoiceId) {
        const { Invoice } = require("../../Invoice/Model/InvoiceModel");
        invoiceDoc = await Invoice.findOne({ _id: invoiceId, isDeleted: false });
    }

    let journalPayload;
    if (normalizedEntryType === "PAYMENT") {
        // PAYMENT (Money Out): DEBIT Offset Account (Expense/Vendor), CREDIT Bank Account
        journalPayload = {
            description: description || `Manual Payment Sent via ${paymentMode}`,
            date: parsedDate,
            branch: finalBranchId,
            paymentMode,
            currency: currency || "USD",
            fromAccount: targetAccount._id,
            toAccount: cleanOffsetAccountId || undefined,
            supportingDocument,
            lines: [
                {
                    accountingCode: offsetAccountingCode,
                    type: "DEBIT",
                    amount: numericAmount,
                    description: description || `Manual Payment Sent - Mode: ${paymentMode}`,
                    contact: cleanCustomerId || undefined
                },
                {
                    accountingCode: targetAccount.accountingCode,
                    type: "CREDIT",
                    amount: numericAmount,
                    description: description || `Manual Payment Sent via Bank - Mode: ${paymentMode}`,
                    contact: cleanCustomerId || undefined
                }
            ],
            createdBy: userId,
            creatorRole: finalRole
        };
    } else {
        // RECEIPT (Money In): DEBIT Bank Account, CREDIT Offset Account / AR
        journalPayload = {
            description: description || `Manual Payment Received via ${paymentMode}`,
            date: parsedDate,
            branch: finalBranchId,
            paymentMode,
            currency: currency || "USD",
            fromAccount: cleanOffsetAccountId || undefined,
            toAccount: targetAccount._id,
            supportingDocument,
            lines: [
                {
                    accountingCode: targetAccount.accountingCode,
                    type: "DEBIT",
                    amount: numericAmount,
                    description: description || `Manual Payment Received - Mode: ${paymentMode}${invoiceDoc ? ` (INV: ${invoiceDoc.invoiceNumber})` : ''}`,
                    contact: cleanCustomerId || undefined
                },
                {
                    accountingCode: offsetAccountingCode,
                    type: "CREDIT",
                    amount: numericAmount,
                    description: description || `Manual Payment Received - Mode: ${paymentMode}${invoiceDoc ? ` (INV: ${invoiceDoc.invoiceNumber})` : ''}`,
                    contact: cleanCustomerId || undefined
                }
            ],
            createdBy: userId,
            creatorRole: finalRole
        };
    }

    const result = await ManualJournalService.createManualJournal(journalPayload);

    // Apply the payment to the Invoice if one is selected
    if (normalizedEntryType === "RECEIPT" && invoiceDoc && invoiceDoc.status !== "PAID") {
        const timestamp = new Date();
        let newPaid = (invoiceDoc.amountPaid || 0) + numericAmount;
        let newBalance = Math.max(0, invoiceDoc.totalAmountDue - newPaid);
        let newStatus = "PENDING";

        let excessAmount = 0;
        if (newPaid > invoiceDoc.totalAmountDue) {
            excessAmount = newPaid - invoiceDoc.totalAmountDue;
            newPaid = invoiceDoc.totalAmountDue;
            newBalance = 0;
        }

        if (newBalance <= 0) newStatus = "PAID";
        else if (newPaid > 0) newStatus = "PARTIAL";

        const paymentRecord = {
            amount: numericAmount - excessAmount,
            paidAt: timestamp,
            paymentMethod: paymentMode || "Cash",
            transactionId: result.journal?.journalNumber || undefined,
            note: description || `Payment reflected via manual payment record`,
        };

        invoiceDoc.amountPaid = newPaid;
        invoiceDoc.balance = newBalance;
        invoiceDoc.status = newStatus;
        invoiceDoc.payments.push(paymentRecord);
        if (newStatus === "PAID" && !invoiceDoc.paidAt) {
            invoiceDoc.paidAt = timestamp;
        }
        await invoiceDoc.save();

        if (invoiceDoc.invoiceType === 'WORKSHOP' && invoiceDoc.serviceBill) {
            try {
                const { ServiceBill } = require("../../ServiceBill/Model/ServiceBillModel");
                const bill = await ServiceBill.findById(invoiceDoc.serviceBill);
                if (bill) {
                    const billAmount = numericAmount - excessAmount;
                    const newBillAmountPaid = (bill.amountPaid || 0) + billAmount;
                    const newBillPaymentStatus = newBillAmountPaid >= bill.totalAmount - 0.01 ? "PAID" : "PARTIAL";
                    const newBillStatus = newBillPaymentStatus === "PAID" ? "PAID" : bill.status;

                    await ServiceBill.findByIdAndUpdate(bill._id, {
                        $inc: { amountPaid: billAmount },
                        $push: {
                            payments: {
                                amount: billAmount,
                                paidAt: timestamp,
                                paymentMethod: paymentMode || "Cash",
                                paymentReference: result.journal?.journalNumber,
                                notes: description || `Payment synced from Invoice ${invoiceDoc.invoiceNumber}`,
                                recordedBy: userId
                            }
                        },
                        $set: {
                            paymentStatus: newBillPaymentStatus,
                            status: newBillStatus,
                            paidAt: newBillPaymentStatus === "PAID" ? timestamp : bill.paidAt
                        }
                    });
                }
            } catch (billErr) {
                console.error("Failed to sync bill for invoice payment:", billErr);
            }
        }

        try {
            const InvoiceService = require("../../Invoice/Service/InvoiceService");
            await InvoiceService.syncInvoiceToAdditionalPayments(invoiceDoc);
            await InvoiceService.rolloverCustomerInvoices(invoiceDoc.customer);

            if (excessAmount > 0) {
                await InvoiceService.applyExcessToNextInvoice(invoiceDoc.customer, excessAmount, {
                    paymentMethod: paymentMode || "Cash",
                    transactionId: result.journal?.journalNumber || undefined,
                    createdBy: userId,
                    creatorRole: finalRole
                });
            }
        } catch (syncErr) {
            console.error("Failed to run sync and rollover services for invoice:", syncErr);
        }
    }

    // Update target balance
    let targetBalanceChange = 0;
    if (normalizedEntryType === "PAYMENT") {
        targetBalanceChange = targetAccount.accountType === "Credit Card" ? numericAmount : -numericAmount;
    } else {
        targetBalanceChange = targetAccount.accountType === "Credit Card" ? -numericAmount : numericAmount;
    }
    targetAccount.currentBalance = Number(targetAccount.currentBalance || 0) + targetBalanceChange;
    await targetAccount.save();

    // Create BankTransaction record for Target Bank Account
    const BankTransaction = require("../Model/BankTransactionModel");
    const targetBankTx = new BankTransaction({
        bankAccount: targetAccount._id,
        transactionId: result.journal?.journalNumber || `TXN-${Date.now()}`,
        entryDate: parsedDate,
        amount: numericAmount,
        type: normalizedEntryType === "RECEIPT" ? "DEBIT" : "CREDIT",
        description: description || `Manual Payment ${normalizedEntryType === "RECEIPT" ? "Received" : "Sent"} via ${paymentMode}`,
        runningBalance: targetAccount.currentBalance,
        accountingCode: offsetAccountingCode || undefined,
        customer: cleanCustomerId || undefined,
        invoice: cleanInvoiceId || undefined,
        paymentMode: paymentMode || "Bank Transfer",
        currency: currency || "USD",
        createdBy: userId,
        creatorRole: finalRole
    });
    await targetBankTx.save();

    // Update offset balance if offset account is a BankAccount
    if (offsetAccount) {
        let offsetBalanceChange = 0;
        if (normalizedEntryType === "PAYMENT") {
            offsetBalanceChange = offsetAccount.accountType === "Credit Card" ? -numericAmount : numericAmount;
        } else {
            offsetBalanceChange = offsetAccount.accountType === "Credit Card" ? numericAmount : -numericAmount;
        }
        offsetAccount.currentBalance = Number(offsetAccount.currentBalance || 0) + offsetBalanceChange;
        await offsetAccount.save();

        // Create BankTransaction record for Offset Bank Account
        const offsetBankTx = new BankTransaction({
            bankAccount: offsetAccount._id,
            transactionId: result.journal?.journalNumber || `TXN-${Date.now()}`,
            entryDate: parsedDate,
            amount: numericAmount,
            type: normalizedEntryType === "PAYMENT" ? "DEBIT" : "CREDIT",
            description: description || `Manual Transfer ${normalizedEntryType === "PAYMENT" ? "Received from" : "Sent to"} ${targetAccount.accountName || targetAccount.bankName}`,
            runningBalance: offsetAccount.currentBalance,
            accountingCode: targetAccount.accountingCode || undefined,
            customer: cleanCustomerId || undefined,
            invoice: cleanInvoiceId || undefined,
            paymentMode: paymentMode || "Bank Transfer",
            currency: currency || "USD",
            createdBy: userId,
            creatorRole: finalRole
        });
        await offsetBankTx.save();
    }

    try {
        await syncAccountingCodeBalances(targetAccount.accountingCode);
        if (offsetAccountingCode) await syncAccountingCodeBalances(offsetAccountingCode);
        await recalculateRunningBalances(targetAccount._id);
        if (offsetAccount) await recalculateRunningBalances(offsetAccount._id);
    } catch (syncCodeErr) {
        console.error("Failed to sync balances after manual payment:", syncCodeErr);
    }

    return {
        success: true,
        journal: result.journal,
        targetNewBalance: targetAccount.currentBalance,
        fromNewBalance: offsetAccount ? offsetAccount.currentBalance : undefined
    };
};

/**
 * Helper function to revert invoice set-offs and statuses when bank transactions are deleted
 */
const revertInvoiceSetOffsForTransactions = async (bankTransactions = [], ledgerEntries = []) => {
    try {
        const { Invoice } = require("../../Invoice/Model/InvoiceModel");
        const { ServiceBill } = require("../../ServiceBill/Model/ServiceBillModel");
        const PaymentReceived = require("../../PaymentReceived/Model/PaymentReceivedModel");
        const Bill = require("../../Bill/Model/BillModel");
        const PaymentMade = require("../../PaymentMade/Model/PaymentMadeModel");

        // 1. Calculate the exact total amount of the transaction(s) being deleted
        const validTxIds = [
            ...bankTransactions.map(bt => bt.transactionId),
            ...bankTransactions.map(bt => bt._id ? bt._id.toString() : null),
            ...ledgerEntries.map(l => l.transactionId),
            ...ledgerEntries.map(l => l._id ? l._id.toString() : null),
            ...ledgerEntries.map(l => l.manualJournal ? l.manualJournal.toString() : null)
        ].filter(id => id !== undefined && id !== null && String(id).trim() !== '');

        const bankTxIds = bankTransactions.map(bt => bt._id).filter(Boolean);
        const ledgerEntryIds = ledgerEntries.map(l => l._id).filter(Boolean);

        // 2. Delete associated PaymentReceived and PaymentMade records by exact match
        if (validTxIds.length > 0 || bankTxIds.length > 0) {
            const prConditions = [];
            const pmConditions = [];
            if (validTxIds.length > 0) {
                prConditions.push({ referenceNumber: { $in: validTxIds } });
                pmConditions.push({ referenceNumber: { $in: validTxIds } });
            }
            if (bankTxIds.length > 0) {
                prConditions.push({ bankTransactionId: { $in: bankTxIds } });
                pmConditions.push({ referenceNumber: { $in: bankTxIds.map(b => b.toString()) } });
            }

            if (prConditions.length > 0) await PaymentReceived.deleteMany({ $or: prConditions });
            if (pmConditions.length > 0) await PaymentMade.deleteMany({ $or: pmConditions });
        }

        // 3. Delete matching InvoiceBillSetOffHistory records
        try {
            const InvoiceBillSetOffHistory = require("../Model/InvoiceBillSetOffHistoryModel");
            const historyConditions = [];
            if (ledgerEntryIds.length > 0) {
                historyConditions.push({ primaryLedgerEntry: { $in: ledgerEntryIds } });
            }
            if (validTxIds.length > 0) {
                const validObjIds = validTxIds.filter(id => mongoose.Types.ObjectId.isValid(id));
                if (validObjIds.length > 0) {
                    historyConditions.push({ primaryLedgerEntry: { $in: validObjIds } });
                }
            }
            if (historyConditions.length > 0) {
                await InvoiceBillSetOffHistory.deleteMany({ $or: historyConditions });
            }
        } catch (histErr) {
            console.error("Error deleting InvoiceBillSetOffHistory records:", histErr);
        }

        // Calculate deduction directly from the deleted ledger entries & bank transactions
        const uniqueLedgerAmounts = [...new Set(ledgerEntries.map(l => Number(l.amount || 0)))];
        const ledgerTxAmount = uniqueLedgerAmounts.reduce((sum, amt) => sum + amt, 0);
        const uniqueBankAmounts = [...new Set(bankTransactions.map(b => Number(b.amount || 0)))];
        const bankTxAmount = uniqueBankAmounts.reduce((sum, amt) => sum + amt, 0);
        const exactDeletedTxValue = ledgerTxAmount > 0 ? ledgerTxAmount : bankTxAmount;

        // 4. Revert Customer Invoices
        const candidateInvoiceIds = new Set();
        for (const btx of bankTransactions) {
            let setOffItems = [];
            if (Array.isArray(btx.invoices) && btx.invoices.length > 0) {
                setOffItems = btx.invoices;
            } else if (btx.invoice) {
                setOffItems = [{ invoiceId: btx.invoice, amountApplied: btx.amount }];
            }
            for (const item of setOffItems) {
                const invId = item.invoiceId || item.invoice;
                if (invId && mongoose.Types.ObjectId.isValid(String(invId))) candidateInvoiceIds.add(String(invId));
            }
        }

        const invQueryConditions = [];
        if (validTxIds.length > 0) invQueryConditions.push({ "payments.transactionId": { $in: validTxIds } });
        const invObjectIds = Array.from(candidateInvoiceIds).filter(id => mongoose.Types.ObjectId.isValid(id));
        if (invObjectIds.length > 0) invQueryConditions.push({ _id: { $in: invObjectIds } });

        if (invQueryConditions.length > 0) {
            const invoices = await Invoice.find({ $or: invQueryConditions });
            for (const invoice of invoices) {
                let deduction = Number(exactDeletedTxValue || 0);
                const remainingPayments = [];
                let paymentRemoved = false;
                if (Array.isArray(invoice.payments)) {
                    for (const p of invoice.payments) {
                        const isMatch = validTxIds.some(tId =>
                            (p.transactionId && String(p.transactionId).trim() === String(tId).trim()) ||
                            (p.reference && String(p.reference).trim() === String(tId).trim()) ||
                            (p.paymentReference && String(p.paymentReference).trim() === String(tId).trim())
                        );
                        if (isMatch && !paymentRemoved) {
                            paymentRemoved = true;
                        } else {
                            remainingPayments.push(p);
                        }
                    }
                    if (!paymentRemoved && remainingPayments.length > 0) remainingPayments.pop();
                }

                if (deduction <= 0 && !paymentRemoved) continue;

                const totalInvoiceAmount = Number(
                    invoice.totalAmountDue !== undefined && invoice.totalAmountDue > 0
                        ? invoice.totalAmountDue
                        : (invoice.baseAmount !== undefined && invoice.baseAmount > 0
                            ? invoice.baseAmount
                            : (invoice.grandTotal !== undefined && invoice.grandTotal > 0
                                ? invoice.grandTotal
                                : ((invoice.amountPaid || 0) + (invoice.balance || 0))))
                );

                const newAmountPaid = Math.max(0, (invoice.amountPaid || 0) - deduction);
                const newBalance = Math.max(0, totalInvoiceAmount - newAmountPaid);

                // Recalculate status evaluating due date
                let newStatus = invoice.status;
                const now = new Date();
                const isOverdue = invoice.dueDate && new Date(invoice.dueDate) < now;

                if (newBalance >= totalInvoiceAmount - 0.01) {
                    newStatus = isOverdue ? "OVERDUE" : "PENDING";
                } else if (newBalance > 0.01) {
                    newStatus = isOverdue ? "OVERDUE" : "PARTIAL";
                } else {
                    newStatus = "PAID";
                }

                invoice.amountPaid = newAmountPaid;
                invoice.balance = newBalance;
                invoice.status = newStatus;
                invoice.payments = remainingPayments;
                await invoice.save();

                // Sync ServiceBill if WORKSHOP invoice
                if (invoice.invoiceType === 'WORKSHOP' && invoice.serviceBill) {
                    try {
                        const bill = await ServiceBill.findById(invoice.serviceBill);
                        if (bill) {
                            const newBillAmountPaid = Math.max(0, (bill.amountPaid || 0) - deduction);
                            const newBillPaymentStatus = newBillAmountPaid >= bill.totalAmount - 0.01 ? "PAID" : (newBillAmountPaid > 0.01 ? "PARTIAL" : "UNPAID");
                            await ServiceBill.findByIdAndUpdate(bill._id, {
                                $set: {
                                    amountPaid: newBillAmountPaid,
                                    paymentStatus: newBillPaymentStatus,
                                    status: newBillPaymentStatus === "PAID" ? "PAID" : "APPROVED"
                                }
                            });
                        }
                    } catch (sbErr) {
                        console.error(`Error reverting ServiceBill for Invoice ${invoice.invoiceNumber}:`, sbErr);
                    }
                }
            }
        }

        // 5. Revert Vendor Bills
        const candidateBillIds = new Set();
        for (const btx of bankTransactions) {
            if (Array.isArray(btx.bills) && btx.bills.length > 0) {
                btx.bills.forEach(b => {
                    const bId = b.billId || b.bill;
                    if (bId && mongoose.Types.ObjectId.isValid(String(bId))) candidateBillIds.add(String(bId));
                });
            }
        }
        for (const lEntry of ledgerEntries) {
            if (Array.isArray(lEntry.invoices) && lEntry.invoices.length > 0) {
                lEntry.invoices.forEach(i => {
                    const bId = i.invoiceId || i.billId;
                    if (bId && mongoose.Types.ObjectId.isValid(String(bId))) candidateBillIds.add(String(bId));
                });
            }
        }

        const billQueryConditions = [];
        if (validTxIds.length > 0) billQueryConditions.push({ "payments.transactionId": { $in: validTxIds } });
        const billObjectIds = Array.from(candidateBillIds).filter(id => mongoose.Types.ObjectId.isValid(id));
        if (billObjectIds.length > 0) billQueryConditions.push({ _id: { $in: billObjectIds } });

        if (billQueryConditions.length > 0) {
            const bills = await Bill.find({ $or: billQueryConditions });
            for (const bill of bills) {
                let deduction = Number(exactDeletedTxValue || 0);
                const remainingBillPayments = [];
                let pRemoved = false;

                if (Array.isArray(bill.payments)) {
                    for (const p of bill.payments) {
                        const isMatch = validTxIds.some(tId =>
                            (p.transactionId && String(p.transactionId).trim() === String(tId).trim()) ||
                            (p.paymentMadeId && String(p.paymentMadeId).trim() === String(tId).trim()) ||
                            (p.reference && String(p.reference).trim() === String(tId).trim())
                        );
                        if (isMatch && !pRemoved) {
                            pRemoved = true;
                        } else {
                            remainingBillPayments.push(p);
                        }
                    }
                    if (!pRemoved && remainingBillPayments.length > 0) remainingBillPayments.pop();
                }

                if (deduction <= 0 && !pRemoved) continue;

                const newBillAmountPaid = Math.max(0, (bill.amountPaid || 0) - deduction);
                const newBillBalanceDue = Math.max(0, (bill.totalAmount || 0) - newBillAmountPaid);

                // Recalculate bill status checking due date
                let newBillStatus = "OPEN";
                const now = new Date();
                const isBillOverdue = bill.dueDate && new Date(bill.dueDate) < now;

                if (newBillBalanceDue >= (bill.totalAmount || 0) - 0.01) {
                    newBillStatus = isBillOverdue ? "OVERDUE" : "OPEN";
                } else if (newBillBalanceDue > 0.01) {
                    newBillStatus = isBillOverdue ? "OVERDUE" : "PARTIALLY_PAID";
                } else {
                    newBillStatus = "PAID";
                }

                bill.amountPaid = newBillAmountPaid;
                bill.balanceDue = newBillBalanceDue;
                bill.status = newBillStatus;
                bill.payments = remainingBillPayments;
                if (newBillStatus !== "PAID") {
                    bill.paidAt = undefined;
                }
                await bill.save();
            }
        }
    } catch (err) {
        console.error("Error in revertInvoiceSetOffsForTransactions:", err);
    }
};

/**
 * Delete ALL ledger transactions linked to a bank account's accounting code.
 * Also removes the parent ManualJournal documents and resets currentBalance.
 */
const deleteAllTransactions = async (id) => {
    const account = await BankAccount.findOne({ _id: id, isDeleted: false });
    if (!account) throw new AppError("Bank account not found", 404);

    if (!account.accountingCode) {
        throw new AppError("Bank account has no accounting code linked", 400);
    }

    const BankTransaction = require("../Model/BankTransactionModel");
    const LedgerEntry = require("../../Ledger/Model/LedgerEntryModel");
    const ManualJournal = require("../../Ledger/Model/ManualJournalModel");

    const bankTransactions = await BankTransaction.find({ bankAccount: id });
    const ledgerEntries = await LedgerEntry.find({ accountingCode: account.accountingCode });

    // Revert all invoice set-offs and payment received records
    await revertInvoiceSetOffsForTransactions(bankTransactions, ledgerEntries);

    // Delete BankTransaction documents
    await BankTransaction.deleteMany({ bankAccount: id });

    // Collect unique manualJournal IDs from entries
    const journalIds = [...new Set(
        ledgerEntries
            .filter(e => e.manualJournal)
            .map(e => e.manualJournal.toString())
    )];

    let deletedEntries = 0;
    if (journalIds.length > 0) {
        const result = await LedgerEntry.deleteMany({ manualJournal: { $in: journalIds } });
        deletedEntries = result.deletedCount;

        await ManualJournal.deleteMany({ _id: { $in: journalIds } });
    }

    const orphanResult = await LedgerEntry.deleteMany({
        accountingCode: account.accountingCode,
        manualJournal: { $exists: false }
    });
    deletedEntries += orphanResult.deletedCount;

    // Reset current balance back to initial balance
    const previousBalance = account.currentBalance;
    account.currentBalance = account.initialBalance || 0;
    await account.save();

    if (account.accountingCode) {
        const { syncAccountingCodeBalances } = require("./BankAccountService");
        await syncAccountingCodeBalances(account.accountingCode);
    }

    return {
        deletedJournals: journalIds.length,
        deletedEntries,
        previousBalance,
        newBalance: account.currentBalance
    };
};

const recalculateRunningBalances = async (bankAccountId) => {
    const BankAccount = require("../Model/BankAccountModel");
    const BankTransaction = require("../Model/BankTransactionModel");
    const LedgerEntry = require("../../Ledger/Model/LedgerEntryModel");

    const account = await BankAccount.findOne({ _id: bankAccountId, isDeleted: false });
    if (!account) return;

    const isCreditCard = account.accountType === 'Credit Card';

    // 1. Recalculate running balance on all BankTransactions for this account
    const bankTxs = await BankTransaction.find({ bankAccount: bankAccountId })
        .sort({ entryDate: 1, createdAt: 1, _id: 1 });

    let bankBalanceAccum = account.initialBalance || 0;
    const bankBulkOps = [];

    for (const tx of bankTxs) {
        if (tx.type === 'DEBIT') {
            bankBalanceAccum = isCreditCard ? (bankBalanceAccum - (tx.amount || 0)) : (bankBalanceAccum + (tx.amount || 0));
        } else if (tx.type === 'CREDIT') {
            bankBalanceAccum = isCreditCard ? (bankBalanceAccum + (tx.amount || 0)) : (bankBalanceAccum - (tx.amount || 0));
        }

        bankBulkOps.push({
            updateOne: {
                filter: { _id: tx._id },
                update: { $set: { runningBalance: bankBalanceAccum } }
            }
        });
    }

    if (bankBulkOps.length > 0) {
        await BankTransaction.bulkWrite(bankBulkOps);
    }

    // 2. Recalculate running balance on all LedgerEntries for this account's accounting code
    let ledgerBalanceAccum = account.initialBalance || 0;
    if (account.accountingCode) {
        const entries = await LedgerEntry.find({ accountingCode: account.accountingCode })
            .sort({ entryDate: 1, createdAt: 1, _id: 1 });

        const ledgerBulkOps = [];

        for (const entry of entries) {
            if (entry.type === 'DEBIT') {
                ledgerBalanceAccum = isCreditCard ? (ledgerBalanceAccum - (entry.amount || 0)) : (ledgerBalanceAccum + (entry.amount || 0));
            } else if (entry.type === 'CREDIT') {
                ledgerBalanceAccum = isCreditCard ? (ledgerBalanceAccum + (entry.amount || 0)) : (ledgerBalanceAccum - (entry.amount || 0));
            }

            if (Math.abs((entry.runningBalance || 0) - ledgerBalanceAccum) > 0.001) {
                ledgerBulkOps.push({
                    updateOne: {
                        filter: { _id: entry._id },
                        update: { $set: { runningBalance: ledgerBalanceAccum } }
                    }
                });
            }

            if (ledgerBulkOps.length >= 5000) {
                await LedgerEntry.bulkWrite(ledgerBulkOps);
                ledgerBulkOps.length = 0;
            }
        }

        if (ledgerBulkOps.length > 0) {
            await LedgerEntry.bulkWrite(ledgerBulkOps);
        }
    }

    // 3. Update BankAccount currentBalance to ledgerBalanceAccum if accountingCode exists
    const finalBalance = account.accountingCode ? ledgerBalanceAccum : bankBalanceAccum;
    account.currentBalance = finalBalance;
    await account.save();

    // 4. Sync AccountingCode balance
    if (account.accountingCode) {
        await syncAccountingCodeBalances(account.accountingCode);
    }

    return finalBalance;
};

const bulkDeleteTransactions = async (bankAccountId, transactionIds) => {
    const BankAccount = require("../Model/BankAccountModel");
    const BankTransaction = require("../Model/BankTransactionModel");
    const LedgerEntry = require("../../Ledger/Model/LedgerEntryModel");
    const ManualJournal = require("../../Ledger/Model/ManualJournalModel");
    const InvoiceBillSetOffHistory = require("../Model/InvoiceBillSetOffHistoryModel");

    const account = await BankAccount.findOne({ _id: bankAccountId, isDeleted: false });
    if (!account) throw new AppError("Bank account not found", 404);

    // 1. Fetch primary selected ledger entries (by _id or transactionId)
    const selectedEntries = await LedgerEntry.find({
        $or: [
            { _id: { $in: transactionIds } },
            { transactionId: { $in: transactionIds } }
        ]
    });
    if (selectedEntries.length === 0) return { deletedCount: 0 };

    const selectedEntryIds = selectedEntries.map(e => e._id);

    // 2. Gather all linking identifiers from selectedEntries:
    //    a) manualJournal ObjectIds
    //    b) transactionId strings
    const journalIds = [...new Set(selectedEntries.map(e => e.manualJournal).filter(Boolean))];
    const txIdStrings = [...new Set(
        selectedEntries
            .map(e => e.transactionId)
            .filter(id => id !== undefined && id !== null && String(id).trim() !== '')
    )];

    // 3. Find connected InvoiceBillSetOffHistory documents
    const historyConditions = [
        { primaryLedgerEntry: { $in: selectedEntryIds } },
        { partnerLedgerEntries: { $in: selectedEntryIds } }
    ];
    if (txIdStrings.length > 0) {
        historyConditions.push({ transactionId: { $in: txIdStrings } });
    }
    const historyDocs = await InvoiceBillSetOffHistory.find({ $or: historyConditions });

    const historyPartnerEntryIds = historyDocs.flatMap(h => h.partnerLedgerEntries || []);
    const historyPrimaryEntryIds = historyDocs.map(h => h.primaryLedgerEntry).filter(Boolean);

    // 4. Build comprehensive query for ALL connected double-entry legs
    const connectedQueryConditions = [
        { _id: { $in: selectedEntryIds } }
    ];
    if (journalIds.length > 0) {
        connectedQueryConditions.push({ manualJournal: { $in: journalIds } });
    }
    if (txIdStrings.length > 0) {
        connectedQueryConditions.push({ transactionId: { $in: txIdStrings } });
    }
    if (historyPartnerEntryIds.length > 0) {
        connectedQueryConditions.push({ _id: { $in: historyPartnerEntryIds } });
    }
    if (historyPrimaryEntryIds.length > 0) {
        connectedQueryConditions.push({ _id: { $in: historyPrimaryEntryIds } });
    }

    const allConnectedEntries = await LedgerEntry.find({ $or: connectedQueryConditions });
    const allConnectedEntryIds = allConnectedEntries.map(e => e._id);

    // 5. Collect all affected Bank Accounts (including Inter-Bank partner bank accounts)
    const affectedBankAccountIds = new Set([String(bankAccountId)]);
    const connectedAccountingCodeIds = [...new Set(allConnectedEntries.map(e => e.accountingCode).filter(Boolean))];

    if (connectedAccountingCodeIds.length > 0) {
        const partnerBankAccs = await BankAccount.find({
            accountingCode: { $in: connectedAccountingCodeIds },
            isDeleted: { $ne: true }
        });
        partnerBankAccs.forEach(b => affectedBankAccountIds.add(String(b._id)));
    }

    // 6. Find matching BankTransactions for deletion
    let matchedBankTxs = [];
    if (txIdStrings.length > 0) {
        matchedBankTxs = await BankTransaction.find({
            $or: [
                { bankAccount: { $in: Array.from(affectedBankAccountIds) } },
                { transactionId: { $in: txIdStrings } }
            ],
            transactionId: { $in: txIdStrings }
        });
    }

    // 7. Revert invoice / bill set-offs and remove PaymentReceived / PaymentMade / SetOffHistory
    await revertInvoiceSetOffsForTransactions(matchedBankTxs, allConnectedEntries);

    let deletedCount = 0;

    // Delete BankTransaction documents
    if (matchedBankTxs.length > 0) {
        const btxDelRes = await BankTransaction.deleteMany({
            _id: { $in: matchedBankTxs.map(b => b._id) }
        });
        deletedCount += btxDelRes.deletedCount;
    }

    // Delete ALL connected ledger entries & manual journals
    if (allConnectedEntryIds.length > 0) {
        const delEntriesRes = await LedgerEntry.deleteMany({ _id: { $in: allConnectedEntryIds } });
        deletedCount += delEntriesRes.deletedCount;
    }
    if (journalIds.length > 0) {
        await ManualJournal.deleteMany({ _id: { $in: journalIds } });
    }

    // 8. Recalculate running balances for ALL affected bank accounts (Primary + Partner Bank Accounts)
    for (const accId of affectedBankAccountIds) {
        await recalculateRunningBalances(accId);
    }

    return { deletedCount };
};

const bulkEditTransactions = async (bankAccountId, updates) => {
    const BankAccount = require("../Model/BankAccountModel");
    const LedgerEntry = require("../../Ledger/Model/LedgerEntryModel");
    const ManualJournal = require("../../Ledger/Model/ManualJournalModel");
    const BankTransaction = require("../Model/BankTransactionModel");
    const Customer = require("../../Customer/Model/CustomerModel");
    const Invoice = require("../../Invoice/Model/InvoiceModel").Invoice;

    const account = await BankAccount.findOne({ _id: bankAccountId, isDeleted: false });
    if (!account) throw new AppError("Bank account not found", 404);

    const affectedBankAccounts = new Set([bankAccountId]);
    const escapeRegExp = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    for (const update of updates) {
        const {
            id: txId,
            entryDate,
            description,
            type,
            amount,
            bankName,
            bankAccountId: newBankAccountId,
            accountingCode,
            customer: rawCustomer,
            customerId: rawCustomerId,
            invoice
        } = update;
        const customer = rawCustomer || rawCustomerId;
        const entry = await LedgerEntry.findById(txId);
        if (!entry) continue;

        const oldEntryDate = entry.entryDate;
        const oldAmount = entry.amount;
        const oldType = entry.type;

        if (entryDate !== undefined) entry.entryDate = new Date(entryDate);
        if (description !== undefined) entry.description = description;
        if (type !== undefined) entry.type = type;
        if (amount !== undefined) entry.amount = Number(amount);

        // 1. Swapping Bank Accounts (BANK NAME)
        let resolvedNewBank = null;
        if (newBankAccountId && String(newBankAccountId) !== String(bankAccountId)) {
            resolvedNewBank = await BankAccount.findOne({ _id: newBankAccountId, isDeleted: false });
        } else if (bankName && String(bankName).trim()) {
            const trimmedBankName = String(bankName).trim();
            resolvedNewBank = await BankAccount.findOne({
                $or: [
                    { bankName: { $regex: new RegExp(`^${escapeRegExp(trimmedBankName)}$`, "i") } },
                    { accountName: { $regex: new RegExp(`^${escapeRegExp(trimmedBankName)}$`, "i") } }
                ],
                isDeleted: false
            });
        }

        if (resolvedNewBank && String(resolvedNewBank._id) !== String(bankAccountId)) {
            console.log(`[bulkEditTransactions] Swapping bank from ${account.accountName} to ${resolvedNewBank.accountName}`);

            // Track the new bank account ID for balance recalculation at the end
            affectedBankAccounts.add(resolvedNewBank._id.toString());

            // Find matching BankTransaction
            const bankTx = await BankTransaction.findOne({
                bankAccount: bankAccountId,
                $or: [
                    { transactionId: entry.transactionId },
                    { entryDate: oldEntryDate, amount: oldAmount, type: oldType }
                ]
            });

            if (bankTx) {
                bankTx.bankAccount = resolvedNewBank._id;
                bankTx.accountingCode = resolvedNewBank.accountingCode;
                if (entryDate !== undefined) bankTx.entryDate = new Date(entryDate);
                if (description !== undefined) bankTx.description = description;
                if (type !== undefined) {
                    bankTx.type = type;
                    bankTx.transactionType = type;
                }
                if (amount !== undefined) bankTx.amount = Number(amount);
                await bankTx.save();
            }

            // Update primary ledger entry accounting code to the new bank's accounting code
            entry.accountingCode = resolvedNewBank.accountingCode;
        }

        await entry.save();

        // 2. Swapping Offsetting Accounts (accountingCode) - Only for non-customer / non-set-off entries
        const targetCustomerId = (typeof customer === 'object' && customer !== null) ? (customer._id || customer.id) : (customer || entry.contact);
        if (accountingCode !== undefined && !targetCustomerId) {
            const AccountingCode = require("../../AccountingCode/Model/AccountingCodeModel");

            let partner = null;
            if (entry.manualJournal) {
                const journalLines = await LedgerEntry.find({ manualJournal: entry.manualJournal });
                partner = journalLines.find(l => l._id.toString() !== entry._id.toString());
            } else if (entry.transaction) {
                const transactionLines = await LedgerEntry.find({ transaction: entry.transaction });
                partner = transactionLines.find(l => l._id.toString() !== entry._id.toString());
            }

            let targetCodeDoc = null;
            if (accountingCode && mongoose.Types.ObjectId.isValid(accountingCode)) {
                targetCodeDoc = await AccountingCode.findOne({ _id: accountingCode, isDeleted: false });
            } else if (accountingCode && String(accountingCode).trim()) {
                const cleanAcc = String(accountingCode).trim();
                targetCodeDoc = await AccountingCode.findOne({
                    $or: [
                        { code: cleanAcc },
                        { name: { $regex: new RegExp(`^${escapeRegExp(cleanAcc)}$`, "i") } }
                    ],
                    isDeleted: false
                });
            }

            // Fallback: if no targetCodeDoc is resolved (e.g. cleared in UI) AND the partner is currently Accounts Receivable,
            // automatically swap it to a default offset code (like Suspense or Income)
            if (!targetCodeDoc) {
                const arCodeDoc = await AccountingCode.findOne({ code: "1.1.03" }) || await AccountingCode.findOne({ accountType: "Accounts Receivable" });
                if (partner && arCodeDoc && String(partner.accountingCode) === String(arCodeDoc._id)) {
                    const defaultOffset = await AccountingCode.findOne({ code: "1200" })
                        || await AccountingCode.findOne({ name: /suspense/i })
                        || await AccountingCode.findOne({ category: "INCOME" })
                        || await AccountingCode.findOne({ category: "REVENUE" })
                        || await AccountingCode.findOne({ _id: { $ne: arCodeDoc._id } });
                    if (defaultOffset) {
                        targetCodeDoc = defaultOffset;
                        console.log(`[bulkEditTransactions] Automatically swapped partner code from Accounts Receivable to default offset ${defaultOffset.code}`);
                    }
                }
            }

            if (targetCodeDoc) {
                if (partner) {
                    const oldSubAccId = partner.accountingCode;
                    partner.accountingCode = targetCodeDoc._id;
                    if (entryDate !== undefined) partner.entryDate = new Date(entryDate);
                    if (amount !== undefined) partner.amount = Number(amount);
                    if (type !== undefined) partner.type = type === "DEBIT" ? "CREDIT" : "DEBIT";
                    await partner.save();

                    if (oldSubAccId) {
                        await syncAccountingCodeBalances(oldSubAccId);
                    }
                    await syncAccountingCodeBalances(targetCodeDoc._id);
                } else {
                    // Convert single-entry to double-entry
                    const journal = await ManualJournal.create({
                        description: entry.description,
                        date: entry.entryDate,
                        branch: entry.branch,
                        totalAmount: entry.amount,
                        status: "POSTED",
                        createdBy: entry.createdBy,
                        creatorRole: entry.creatorRole
                    });

                    entry.manualJournal = journal._id;
                    await entry.save();

                    const partner = new LedgerEntry({
                        branch: entry.branch,
                        accountingCode: targetCodeDoc._id,
                        type: entry.type === "DEBIT" ? "CREDIT" : "DEBIT",
                        amount: entry.amount,
                        description: entry.description,
                        entryDate: entry.entryDate,
                        transactionId: entry.transactionId,
                        manualJournal: journal._id,
                        createdBy: entry.createdBy,
                        creatorRole: entry.creatorRole
                    });
                    await partner.save();

                    await syncAccountingCodeBalances(targetCodeDoc._id);
                }
            }
        }

        // 3. Customer & Invoice Re-linking / Amount Updating
        let bankTx = null;
        if (entry.transactionId) {
            bankTx = await BankTransaction.findOne({
                bankAccount: bankAccountId,
                transactionId: entry.transactionId
            });
        }

        if (!bankTx) {
            // Fallback matching with a 1-minute window tolerance to handle millisecond/second discrepancy
            const dateStart = new Date(oldEntryDate);
            dateStart.setMinutes(dateStart.getMinutes() - 1);
            const dateEnd = new Date(oldEntryDate);
            dateEnd.setMinutes(dateEnd.getMinutes() + 1);

            bankTx = await BankTransaction.findOne({
                bankAccount: bankAccountId,
                amount: oldAmount,
                type: oldType,
                entryDate: { $gte: dateStart, $lte: dateEnd }
            });
        }

        if (!bankTx) {
            // Streamlined Architecture: Do not create auxiliary BankTransaction documents on edit
            bankTx = {
                _id: entry._id,
                transactionId: entry.transactionId,
                invoices: [],
                setOffSummary: null,
                save: async () => {} // no-op
            };
        }

        let finalDesc = description !== undefined ? description : (entry.description || '');

        if (bankTx) {
            // Load partner ledger entry if double-entry is present
            let partner = null;
            if (entry.manualJournal) {
                const journalLines = await LedgerEntry.find({ manualJournal: entry.manualJournal });
                partner = journalLines.find(l => l._id.toString() !== entry._id.toString());
            } else if (entry.transaction) {
                const transactionLines = await LedgerEntry.find({ transaction: entry.transaction });
                partner = transactionLines.find(l => l._id.toString() !== entry._id.toString());
            }

            const oldInvoiceId = (typeof bankTx.invoice === 'object' && bankTx.invoice !== null) ? (bankTx.invoice._id || bankTx.invoice.id) : bankTx.invoice;
            const newInvoiceId = (typeof invoice === 'object' && invoice !== null) ? (invoice._id || invoice.id) : invoice;
            const oldCustomerId = (typeof bankTx.customer === 'object' && bankTx.customer !== null)
                ? (bankTx.customer._id || bankTx.customer.id)
                : (bankTx.customer || entry.customer || entry.contact || (partner && partner.contact));
            const newCustomerId = (typeof customer === 'object' && customer !== null) ? (customer._id || customer.id) : customer;

            const oldSupplierId = (typeof bankTx.supplier === 'object' && bankTx.supplier !== null)
                ? (bankTx.supplier._id || bankTx.supplier.id)
                : (bankTx.supplier || entry.supplier);
            const newSupplierId = update.supplierId || update.supplier || update.vendorId || (typeof supplier !== 'undefined' && typeof supplier === 'object' && supplier !== null ? (supplier._id || supplier.id) : (typeof supplier !== 'undefined' ? supplier : undefined));

            const oldBillId = (typeof bankTx.bill === 'object' && bankTx.bill !== null)
                ? (bankTx.bill._id || bankTx.bill.id)
                : (bankTx.bill || entry.bill);
            const newBillId = update.billId || update.bill || (typeof bill !== 'undefined' && typeof bill === 'object' && bill !== null ? (bill._id || bill.id) : (typeof bill !== 'undefined' ? bill : undefined));

            const finalAmount = amount !== undefined ? Number(amount) : oldAmount;

            const getISTNow = () => {
                const now = new Date();
                return new Date(now.getTime() + (5.5 * 60 * 60 * 1000) + (now.getTimezoneOffset() * 60 * 1000));
            };

            // Construct finalEntryDate using the edit date and Indian Standard Time (IST) edit time
            let finalEntryDate = getISTNow();
            if (entryDate !== undefined && entryDate) {
                const parsedEditDate = new Date(entryDate);
                if (!isNaN(parsedEditDate.getTime())) {
                    if (parsedEditDate.getHours() === 0 && parsedEditDate.getMinutes() === 0 && parsedEditDate.getSeconds() === 0) {
                        const istNow = getISTNow();
                        finalEntryDate = new Date(
                            parsedEditDate.getFullYear(),
                            parsedEditDate.getMonth(),
                            parsedEditDate.getDate(),
                            istNow.getHours(),
                            istNow.getMinutes(),
                            istNow.getSeconds(),
                            istNow.getMilliseconds()
                        );
                    } else {
                        finalEntryDate = parsedEditDate;
                    }
                }
            }

            // Automatically sync invoice number in description
            const invoiceRegex = /((?:INV|MAN|WRK)-\w+(?:-\w+)*)/i;

            if (newInvoiceId && String(newInvoiceId) !== String(oldInvoiceId)) {
                const newInvoice = await Invoice.findById(newInvoiceId);
                if (newInvoice) {
                    const matchInvoice = finalDesc.match(invoiceRegex);
                    if (matchInvoice) {
                        finalDesc = finalDesc.replace(matchInvoice[0], newInvoice.invoiceNumber);
                    } else {
                        finalDesc = finalDesc.trim() ? `${finalDesc.trim()} - ${newInvoice.invoiceNumber}` : newInvoice.invoiceNumber;
                    }
                }
            } else if (!newInvoiceId && oldInvoiceId) {
                const matchInvoice = finalDesc.match(invoiceRegex);
                if (matchInvoice) {
                    finalDesc = finalDesc.replace(matchInvoice[0], '').trim();
                    finalDesc = finalDesc
                        .replace(/\s*-\s*$/, '')
                        .replace(/^\s*-\s*/, '')
                        .replace(/\s{2,}/g, ' ')
                        .trim();
                }
            }

            // Resolve customer doc if changing/updating customer
            let newCustomerDoc = null;
            if (newCustomerId) {
                newCustomerDoc = await Customer.findOne({ _id: newCustomerId, isDeleted: false });
            }

            let newSupplierDoc = null;
            if (newSupplierId) {
                const Supplier = require("../../Supplier/Model/SupplierModel");
                newSupplierDoc = await Supplier.findOne({ _id: newSupplierId, isDeleted: { $ne: true } });
            };

            // Check if Amount, Customer, Supplier, Invoice, or Bill is changed or unlinked
            const isAmountChanged = amount !== undefined && Math.abs(Number(amount) - oldAmount) > 0.001;
            const isCustomerChanged = String(oldCustomerId || '') !== String(newCustomerId || '');
            const isSupplierChanged = String(oldSupplierId || '') !== String(newSupplierId || '');
            const isInvoiceChanged = String(oldInvoiceId || '') !== String(newInvoiceId || '');
            const isBillChanged = String(oldBillId || '') !== String(newBillId || '');

            const hasExistingSetOff = (bankTx.invoices && bankTx.invoices.length > 0) ||
                (bankTx.bills && bankTx.bills.length > 0) ||
                oldInvoiceId || oldCustomerId || oldSupplierId || oldBillId;

            if (hasExistingSetOff && (isAmountChanged || isCustomerChanged || isSupplierChanged || isInvoiceChanged || isBillChanged || (!newCustomerId && !newSupplierId))) {
                console.log(`[bulkEditTransactions] Reversing previous set-off / linking for transaction ${bankTx._id}, oldCustomer=${oldCustomerId}, oldSupplier=${oldSupplierId}`);

                // Use history-based reversal (precise undo using before-state)
                let reversalResult = await reverseSetOffFromHistory(bankTx._id);
                if (!reversalResult && entry._id) {
                    reversalResult = await reverseSetOffFromHistory(entry._id);
                }
                if (!reversalResult && bankTx.transactionId) {
                    reversalResult = await reverseSetOffFromHistory(bankTx.transactionId);
                }
                if (!reversalResult && entry.transactionId) {
                    reversalResult = await reverseSetOffFromHistory(entry.transactionId);
                }

                if (!reversalResult) {
                    // FALLBACK: No history exists, use legacy reversal for both customer (PaymentReceived) and supplier (PaymentMade)
                    console.log(`[bulkEditTransactions] No set-off history found, using legacy reversal for bankTx ${bankTx._id}`);

                    const PaymentReceived = require("../../PaymentReceived/Model/PaymentReceivedModel");
                    const PaymentMade = require("../../PaymentMade/Model/PaymentMadeModel");
                    const Bill = require("../../Bill/Model/BillModel");

                    const searchConditionsPR = [];
                    const searchConditionsPM = [];
                    const txIdForSearch = bankTx.transactionId || entry.transactionId;

                    if (txIdForSearch) {
                        searchConditionsPR.push({ referenceNumber: txIdForSearch });
                        searchConditionsPR.push({ notes: { $regex: new RegExp(escapeRegExp(String(txIdForSearch)), "i") } });

                        searchConditionsPM.push({ referenceNumber: txIdForSearch });
                        searchConditionsPM.push({ notes: { $regex: new RegExp(escapeRegExp(String(txIdForSearch)), "i") } });
                    }
                    if (entry._id) {
                        searchConditionsPR.push({ notes: { $regex: new RegExp(escapeRegExp(entry._id.toString()), "i") } });
                        searchConditionsPM.push({ referenceNumber: entry._id.toString() });
                        searchConditionsPM.push({ notes: { $regex: new RegExp(escapeRegExp(entry._id.toString()), "i") } });
                    }
                    if (bankTx._id) {
                        searchConditionsPR.push({ notes: { $regex: new RegExp(escapeRegExp(bankTx._id.toString()), "i") } });
                        searchConditionsPM.push({ referenceNumber: bankTx._id.toString() });
                        searchConditionsPM.push({ notes: { $regex: new RegExp(escapeRegExp(bankTx._id.toString()), "i") } });
                    }
                    if (oldCustomerId) {
                        searchConditionsPR.push({ customerId: oldCustomerId, amountReceived: oldAmount });
                    }
                    if (oldSupplierId) {
                        searchConditionsPM.push({ supplier: oldSupplierId, amount: oldAmount });
                    }

                    const [prDocs, pmDocs] = await Promise.all([
                        searchConditionsPR.length > 0 ? PaymentReceived.find({ $or: searchConditionsPR }) : [],
                        searchConditionsPM.length > 0 ? PaymentMade.find({ $or: searchConditionsPM }) : []
                    ]);

                    const prNumbers = prDocs.map(p => p.paymentNumber).filter(Boolean);
                    const prIds = prDocs.map(p => p._id.toString());
                    const pmIds = pmDocs.map(p => p._id.toString());

                    // Revert supplier bills
                    const prevBillIds = new Set();
                    if (bankTx.bills && bankTx.bills.length > 0) {
                        bankTx.bills.forEach(b => prevBillIds.add(String(b.billId)));
                    }
                    if (oldBillId) prevBillIds.add(String(oldBillId));
                    pmDocs.forEach(pm => {
                        if (pm.bills && pm.bills.length > 0) {
                            pm.bills.forEach(b => prevBillIds.add(String(b.billId)));
                        }
                    });

                    for (const bId of prevBillIds) {
                        const billDoc = await Bill.findById(bId);
                        if (billDoc) {
                            billDoc.payments = (billDoc.payments || []).filter(p => {
                                const matchTxId = txIdForSearch && String(p.transactionId) === String(txIdForSearch);
                                const matchEntryId = String(p.transactionId) === String(entry._id);
                                const matchBankTxId = String(p.transactionId) === String(bankTx._id);
                                const matchPMId = pmIds.includes(String(p.paymentMadeId || p.transactionId || ''));
                                return !(matchTxId || matchEntryId || matchBankTxId || matchPMId);
                            });
                            const newPaid = (billDoc.payments || []).reduce((sum, p) => sum + (p.amount || 0), 0);
                            const newBalance = Math.max(0, billDoc.totalAmount - newPaid);
                            let newStatus = "OPEN";
                            if (newBalance <= 0) { newStatus = "PAID"; }
                            else if (newPaid > 0) { newStatus = "PARTIALLY_PAID"; }
                            billDoc.amountPaid = newPaid;
                            billDoc.balanceDue = newBalance;
                            billDoc.status = newStatus;
                            if (newStatus !== "PAID") { billDoc.paidAt = undefined; }
                            await billDoc.save();
                        }
                    }

                    if (pmIds.length > 0) {
                        await PaymentMade.deleteMany({ _id: { $in: pmIds } });
                        console.log(`[bulkEditTransactions] Deleted ${pmIds.length} PaymentMade record(s) for supplier ${oldSupplierId}`);
                    }

                    // Collect previous invoice IDs to revert
                    const prevInvoiceIds = new Set();
                    if (bankTx.invoices && bankTx.invoices.length > 0) {
                        bankTx.invoices.forEach(i => prevInvoiceIds.add(String(i.invoiceId)));
                    }
                    if (oldInvoiceId) {
                        prevInvoiceIds.add(String(oldInvoiceId));
                    }
                    prDocs.forEach(pr => {
                        if (pr.invoices && pr.invoices.length > 0) {
                            pr.invoices.forEach(i => prevInvoiceIds.add(String(i.invoiceId)));
                        }
                    });
                    if (oldCustomerId) {
                        const custInvoices = await Invoice.find({ customer: oldCustomerId, isDeleted: false });
                        custInvoices.forEach(inv => {
                            const hasMatchingPayment = (inv.payments || []).some(p =>
                                (bankTx.transactionId && String(p.transactionId) === String(bankTx.transactionId)) ||
                                (entry.transactionId && String(p.transactionId) === String(entry.transactionId)) ||
                                (String(p.transactionId) === String(entry._id)) ||
                                (String(p.transactionId) === String(bankTx._id)) ||
                                (entry.manualJournal && String(p.transactionId) === String(entry.manualJournal)) ||
                                (p.note && prNumbers.some(prNum => p.note.includes(prNum))) ||
                                (bankTx.invoices && bankTx.invoices.some(bi => String(bi.invoiceId) === String(inv._id)))
                            );
                            if (hasMatchingPayment) {
                                prevInvoiceIds.add(String(inv._id));
                            }
                        });
                    }

                    // Revert payment amounts & statuses on previous invoices
                    for (const invId of prevInvoiceIds) {
                        const invDoc = await Invoice.findById(invId);
                        if (invDoc) {
                            invDoc.payments = (invDoc.payments || []).filter(p => {
                                const matchTxId = bankTx.transactionId && String(p.transactionId) === String(bankTx.transactionId);
                                const matchEntryTxId = entry.transactionId && String(p.transactionId) === String(entry.transactionId);
                                const matchEntryId = String(p.transactionId) === String(entry._id);
                                const matchBankTxId = String(p.transactionId) === String(bankTx._id);
                                const matchJournalId = entry.manualJournal && String(p.transactionId) === String(entry.manualJournal);
                                const matchPRNumber = p.note && prNumbers.some(prNum => p.note.includes(prNum));
                                const matchInvSetOff = bankTx.invoices && bankTx.invoices.some(bi =>
                                    String(bi.invoiceId) === String(invDoc._id) && Math.abs((p.amount || 0) - (bi.amountApplied || 0)) < 0.01
                                );
                                const isTargetPayment = matchTxId || matchEntryTxId || matchEntryId || matchBankTxId || matchJournalId || matchPRNumber || matchInvSetOff;
                                return !isTargetPayment;
                            });
                            const newPaid = (invDoc.payments || []).reduce((sum, p) => sum + (p.amount || 0), 0);
                            const newBalance = Math.max(0, invDoc.totalAmountDue - newPaid);
                            let newStatus = "PENDING";
                            if (newBalance <= 0) { newStatus = "PAID"; }
                            else if (newPaid > 0) { newStatus = "PARTIAL"; }
                            else {
                                const now = new Date();
                                if (invDoc.dueDate && new Date(invDoc.dueDate) < now) { newStatus = "OVERDUE"; }
                            }
                            invDoc.amountPaid = newPaid;
                            invDoc.balance = newBalance;
                            invDoc.status = newStatus;
                            if (newStatus !== "PAID") { invDoc.paidAt = undefined; }
                            await invDoc.save();

                            if (invDoc.invoiceType === 'WORKSHOP' && invDoc.serviceBill) {
                                try {
                                    const { ServiceBill } = require("../../ServiceBill/Model/ServiceBillModel");
                                    const bill = await ServiceBill.findById(invDoc.serviceBill);
                                    if (bill) {
                                        const newBillPaid = Math.max(0, (bill.amountPaid || 0) - oldAmount);
                                        const newBillPaymentStatus = newBillPaid >= bill.totalAmount - 0.01 ? "PAID" : (newBillPaid > 0 ? "PARTIAL" : "PENDING");
                                        await ServiceBill.findByIdAndUpdate(bill._id, {
                                            $set: { amountPaid: newBillPaid, paymentStatus: newBillPaymentStatus, status: newBillPaymentStatus === "PAID" ? "PAID" : bill.status }
                                        });
                                    }
                                } catch (sbErr) {
                                    console.error("[bulkEditTransactions] Failed to revert ServiceBill:", sbErr);
                                }
                            }
                        }
                    }

                    // Remove previous PaymentReceived records
                    if (prIds.length > 0) {
                        await PaymentReceived.deleteMany({ _id: { $in: prIds } });
                        console.log(`[bulkEditTransactions] Deleted ${prIds.length} PaymentReceived record(s) for customer ${oldCustomerId}`);
                    }

                    // Remove previous double-entry ledger impact and ManualJournals
                    try {
                        const ManualJournal = require("../../Ledger/Model/ManualJournalModel");
                        if (entry.manualJournal) {
                            await LedgerEntry.deleteMany({ manualJournal: entry.manualJournal, _id: { $ne: entry._id } });
                            await ManualJournal.deleteOne({ _id: entry.manualJournal });
                            entry.manualJournal = undefined;
                            partner = null;
                        }
                        const txIds = [bankTx.transactionId, entry.transactionId].filter(Boolean);
                        if (txIds.length > 0) {
                            await LedgerEntry.deleteMany({
                                transactionId: { $in: txIds },
                                _id: { $ne: entry._id }
                            });
                        }
                        const AccountingCode = require("../../AccountingCode/Model/AccountingCodeModel");
                        const arCode = await AccountingCode.findOne({ $or: [{ code: "1.1.03" }, { name: { $regex: /Accounts Receivable|Cuenta por Cobrar/i } }], isDeleted: { $ne: true } });
                        const advCode = await AccountingCode.findOne({ $or: [{ code: "2.1.02" }, { name: { $regex: /Advance Received|Anticipo/i } }], isDeleted: { $ne: true } });
                        const apCode = await AccountingCode.findOne({ $or: [{ code: "2.1.01" }, { name: { $regex: /Accounts Payable|Cuenta por Pagar/i } }], isDeleted: { $ne: true } });
                        const advPaidCode = await AccountingCode.findOne({ $or: [{ code: "1.1.05" }, { name: { $regex: /Advance Paid|Anticipo/i } }], isDeleted: { $ne: true } });
                        if (arCode) await syncAccountingCodeBalances(arCode._id);
                        if (advCode) await syncAccountingCodeBalances(advCode._id);
                        if (apCode) await syncAccountingCodeBalances(apCode._id);
                        if (advPaidCode) await syncAccountingCodeBalances(advPaidCode._id);
                    } catch (mjErr) {
                        console.error("[bulkEditTransactions] Error deleting old ledger journal:", mjErr);
                    }
                } else {
                    // History-based reversal succeeded — also clean up the entry's manualJournal reference
                    if (entry.manualJournal) {
                        entry.manualJournal = undefined;
                        partner = null;
                    }
                }

                // Clear bankTx & entry invoice/bill/setOff metadata
                bankTx.invoices = [];
                bankTx.invoice = undefined;
                bankTx.bills = [];
                bankTx.bill = undefined;
                bankTx.customer = undefined;
                bankTx.supplier = undefined;
                bankTx.setOffSummary = undefined;

                entry.invoices = [];
                entry.bills = [];
                entry.customer = undefined;
                entry.supplier = undefined;
                entry.setOffSummary = undefined;

                // Strip unlinked invoice numbers from descriptions
                const prevInvoiceIdsForDesc = new Set();
                if (entry.invoices && entry.invoices.length > 0) {
                    entry.invoices.forEach(i => prevInvoiceIdsForDesc.add(String(i.invoiceId)));
                }
                if (bankTx.invoices && bankTx.invoices.length > 0) {
                    bankTx.invoices.forEach(i => prevInvoiceIdsForDesc.add(String(i.invoiceId)));
                }
                if (oldInvoiceId) prevInvoiceIdsForDesc.add(String(oldInvoiceId));

                // Clear bankTx & entry invoice/setOff metadata
                bankTx.invoices = [];
                bankTx.invoice = undefined;
                bankTx.setOffSummary = undefined;

                entry.invoices = [];
                entry.setOffSummary = undefined;

                if (prevInvoiceIdsForDesc.size > 0) {
                    const prevInvoiceDocs = await Invoice.find({ _id: { $in: Array.from(prevInvoiceIdsForDesc) } });
                    const prevInvoiceNumbers = prevInvoiceDocs.map(i => i.invoiceNumber).filter(Boolean);
                    for (const invNum of prevInvoiceNumbers) {
                        const invRegex = new RegExp(`(?:\\s*\\|?\\s*-?\\s*Set off:\\s*${escapeRegExp(invNum)}|\\s*\\|?\\s*-?\\s*${escapeRegExp(invNum)})`, 'gi');
                        finalDesc = (finalDesc || '').replace(invRegex, '').trim();
                        entry.description = (entry.description || '').replace(invRegex, '').trim();
                        if (bankTx) {
                            bankTx.description = (bankTx.description || '').replace(invRegex, '').trim();
                        }
                    }
                }
                finalDesc = finalDesc
                    .replace(/\s*-\s*Set off:\s*$/i, '')
                    .replace(/\s*\|\s*$/i, '')
                    .replace(/\s*-\s*$/i, '')
                    .replace(/\s{2,}/g, ' ')
                    .trim();
                entry.description = finalDesc;
            }

            // Perform automatic set-off if a customer is selected and the final type is DEBIT (incoming deposit)
            const finalType = type !== undefined ? type : (entry.type || oldType);
            if (newCustomerId && finalType === "DEBIT") {
                const BankAccount = require("../Model/BankAccountModel");
                const bankAccountDoc = await BankAccount.findById(bankAccountId);
                const bankAccCodeId = bankAccountDoc ? bankAccountDoc.accountingCode : entry.accountingCode;

                const setOffResult = await autoSetOffInvoices(newCustomerId, finalAmount, {
                    bankAccountingCodeId: bankAccCodeId,
                    bankTransactionId: bankTx._id,
                    bankAccountId: bankAccountId,
                    branchId: entry.branch,
                    entryDate: finalEntryDate,
                    description: finalDesc || `Bank statement edit set-off`,
                    transactionId: bankTx.transactionId || entry.transactionId,
                    existingBankLedgerEntryId: entry._id,
                    targetInvoiceId: newInvoiceId,
                    createdBy: entry.createdBy || bankTx.createdBy || "6a2290019fa01283dd165204",
                    creatorRole: entry.creatorRole || bankTx.creatorRole || "ADMIN"
                });

                const newFormattedInvoices = setOffResult.invoicesSetOff.map(inv => ({
                    invoiceId: inv.invoiceId,
                    invoiceNumber: inv.invoiceNumber,
                    amountApplied: inv.amountApplied
                }));
                const newSetOffSummary = {
                    totalSetOff: setOffResult.totalSetOff,
                    invoiceCount: setOffResult.invoicesSetOff.length,
                    excessAmount: setOffResult.excessAmount
                };

                bankTx.customer = newCustomerId;
                bankTx.customerName = newCustomerDoc ? (newCustomerDoc.name || newCustomerDoc.customerName) : undefined;
                bankTx.invoices = newFormattedInvoices;
                bankTx.setOffSummary = newSetOffSummary;
                bankTx.invoice = setOffResult.invoicesSetOff.length > 0 ? setOffResult.invoicesSetOff[0].invoiceId : undefined;

                entry.manualJournal = setOffResult.ledgerJournal || entry.manualJournal;
                entry.invoices = newFormattedInvoices;
                entry.setOffSummary = newSetOffSummary;

                const invoiceNumbers = setOffResult.invoicesSetOff.map(inv => inv.invoiceNumber).join(", ");
                const custName = newCustomerDoc ? (newCustomerDoc.name || newCustomerDoc.customerName) : '';
                if (setOffResult.invoicesSetOff.length > 0) {
                    finalDesc = `Bank deposit - Customer: ${custName} | ${invoiceNumbers}`;
                } else {
                    finalDesc = `Bank deposit - Customer: ${custName} | Advance Payment ($${setOffResult.excessAmount.toFixed(2)})`;
                }
            } else if (newSupplierId && finalType === "CREDIT") {
                const BankAccount = require("../Model/BankAccountModel");
                const bankAccountDoc = await BankAccount.findById(bankAccountId);
                const bankAccCodeId = bankAccountDoc ? bankAccountDoc.accountingCode : entry.accountingCode;

                const billSetOffResult = await autoSetOffBills(newSupplierId, finalAmount, {
                    bankAccountingCodeId: bankAccCodeId,
                    bankTransactionId: bankTx._id,
                    bankAccountId: bankAccountId,
                    branchId: entry.branch,
                    entryDate: finalEntryDate,
                    description: finalDesc || `Bank statement edit vendor payment set-off`,
                    transactionId: bankTx.transactionId || entry.transactionId,
                    existingBankLedgerEntryId: entry._id,
                    targetBillId: update.billId || update.bill,
                    createdBy: entry.createdBy || bankTx.createdBy || "6a2290019fa01283dd165204",
                    creatorRole: entry.creatorRole || bankTx.creatorRole || "ADMIN"
                });

                const newFormattedBills = (billSetOffResult.billsSetOff || []).map(b => ({
                    billId: b.billId,
                    billNumber: b.billNumber,
                    amountApplied: b.amountApplied
                }));
                const newSetOffSummary = {
                    totalSetOff: billSetOffResult.totalSetOff,
                    billCount: (billSetOffResult.billsSetOff || []).length,
                    excessAmount: billSetOffResult.excessAmount
                };

                const Supplier = require("../../Supplier/Model/SupplierModel");
                const supDoc = await Supplier.findById(newSupplierId);

                bankTx.supplier = newSupplierId;
                bankTx.supplierName = supDoc ? (supDoc.name || supDoc.companyName) : undefined;
                bankTx.bills = newFormattedBills;
                bankTx.setOffSummary = newSetOffSummary;

                entry.supplier = newSupplierId;
                entry.bills = newFormattedBills;
                entry.setOffSummary = newSetOffSummary;

                const billNumbers = (billSetOffResult.billsSetOff || []).map(b => b.billNumber).join(", ");
                const supName = supDoc ? (supDoc.name || supDoc.companyName) : '';
                if ((billSetOffResult.billsSetOff || []).length > 0) {
                    finalDesc = `Vendor Payment - Vendor: ${supName} | Bills: ${billNumbers}`;
                } else {
                    finalDesc = `Vendor Payment - Vendor: ${supName} | Vendor Advance ($${billSetOffResult.excessAmount.toFixed(2)})`;
                }
            } else if (!newCustomerId && !newSupplierId) {
                // Both Customer and Supplier unlinked
                bankTx.customer = undefined;
                bankTx.customerName = undefined;
                bankTx.supplier = undefined;
                bankTx.supplierName = undefined;
                bankTx.invoice = undefined;
                bankTx.invoices = [];
                bankTx.bills = [];
                bankTx.setOffSummary = undefined;

                entry.invoices = [];
                entry.bills = [];
                entry.setOffSummary = undefined;
                finalDesc = `Bank statement transaction`;
            }

            // Sync contact (customer) field, description, amount and editing date/time on the LedgerEntries
            entry.contact = newCustomerId || undefined;
            entry.description = finalDesc;
            if (amount !== undefined) entry.amount = finalAmount;
            entry.entryDate = finalEntryDate;
            await entry.save();

            if (partner) {
                partner.contact = newCustomerId || undefined;
                partner.description = finalDesc;
                if (amount !== undefined) partner.amount = finalAmount;
                partner.entryDate = finalEntryDate;
                await partner.save();
            }

            // Update BankTransaction fields
            bankTx.description = finalDesc;
            bankTx.entryDate = finalEntryDate;
            if (type !== undefined) {
                bankTx.type = type;
                bankTx.transactionType = type;
            }
            if (amount !== undefined) bankTx.amount = finalAmount;

            // If accountingCode is updated, make sure it is updated on BankTransaction too
            if (accountingCode) {
                const AccountingCode = require("../../AccountingCode/Model/AccountingCodeModel");
                let matchedCodeDoc = null;
                if (mongoose.Types.ObjectId.isValid(accountingCode)) {
                    matchedCodeDoc = await AccountingCode.findOne({ _id: accountingCode, isDeleted: false });
                } else {
                    const cleanAcc = String(accountingCode).trim();
                    matchedCodeDoc = await AccountingCode.findOne({
                        $or: [
                            { code: cleanAcc },
                            { name: { $regex: new RegExp(`^${escapeRegExp(cleanAcc)}$`, "i") } }
                        ],
                        isDeleted: false
                    });
                }
                if (matchedCodeDoc) {
                    bankTx.accountingCode = matchedCodeDoc._id;
                }
            }

            await bankTx.save();
        }

        // Standard updates when there's an existing manualJournal
        if (entry.manualJournal) {
            const journal = await ManualJournal.findById(entry.manualJournal);
            if (journal) {
                if (entryDate !== undefined) journal.date = new Date(entryDate);
                if (description !== undefined || finalDesc) journal.description = finalDesc || description;
                if (amount !== undefined) journal.totalAmount = Number(amount);
                await journal.save();

                const partnerUpdate = {};
                if (entryDate !== undefined) partnerUpdate.entryDate = new Date(entryDate);
                if (amount !== undefined) partnerUpdate.amount = Number(amount);
                if (description !== undefined || finalDesc) partnerUpdate.description = finalDesc || description;

                if (type !== undefined) {
                    const journalLines = await LedgerEntry.find({ manualJournal: journal._id });
                    if (journalLines.length === 2) {
                        const partner = journalLines.find(l => l._id.toString() !== entry._id.toString());
                        if (partner) {
                            partner.type = type === "DEBIT" ? "CREDIT" : "DEBIT";
                            await partner.save();
                        }
                    }
                }

                if (Object.keys(partnerUpdate).length > 0) {
                    await LedgerEntry.updateMany(
                        { manualJournal: journal._id, _id: { $ne: entry._id } },
                        { $set: partnerUpdate }
                    );
                }

                // Sync balances for all accounting codes in this journal
                const updatedLines = await LedgerEntry.find({ manualJournal: journal._id });
                for (const line of updatedLines) {
                    if (line.accountingCode) {
                        await syncAccountingCodeBalances(line.accountingCode);
                    }
                }
            }
        }

        // Always sync AR (1.1.03) and Advance (2.1.02) balances
        try {
            const AccountingCode = require("../../AccountingCode/Model/AccountingCodeModel");
            const arCode = await AccountingCode.findOne({ $or: [{ code: "1.1.03" }, { name: { $regex: /Accounts Receivable|Cuenta por Cobrar/i } }], isDeleted: { $ne: true } });
            const advCode = await AccountingCode.findOne({ $or: [{ code: "2.1.02" }, { name: { $regex: /Advance Received|Anticipo/i } }], isDeleted: { $ne: true } });
            if (arCode) await syncAccountingCodeBalances(arCode._id);
            if (advCode) await syncAccountingCodeBalances(advCode._id);
        } catch (syncErr) {
            console.error("[bulkEditTransactions] Failed to sync AR/Advance code balances:", syncErr);
        }
    }

    // Recalculate running balances for all affected bank accounts
    for (const affectedId of affectedBankAccounts) {
        await recalculateRunningBalances(affectedId);
        const bankAcc = await BankAccount.findById(affectedId);
        if (bankAcc && bankAcc.accountingCode) {
            await syncAccountingCodeBalances(bankAcc.accountingCode);
        }
    }

    return { success: true };
};

/**
 * Automatically set off an incoming payment amount against a customer's unpaid invoices.
 * Priority: PARTIAL invoices first, then PENDING, sorted by dueDate ASC (oldest first).
 * Creates PaymentReceived records, updates invoice statuses, and generates ledger entries.
 *
 * @param {ObjectId} customerId - The customer ID
 * @param {Number} amount - The total payment amount to set off
 * @param {Object} options - Additional options
 * @param {ObjectId} options.bankAccountingCodeId - The bank's accounting code ID (for DR side)
 * @param {ObjectId} options.branchId - Branch ID for ledger entries
 * @param {Date} options.entryDate - The transaction date
 * @param {String} options.description - Description/note for the payment
 * @param {String} options.transactionId - Reference/transaction ID
 * @param {ObjectId} options.createdBy - User ID
 * @param {String} options.creatorRole - User role
 * @returns {Object} Summary of set-off: { invoicesSetOff: [...], totalSetOff, excessAmount }
 */
const autoSetOffInvoices = async (rawCustomerId, amount, options = {}) => {
    const { Invoice } = require("../../Invoice/Model/InvoiceModel");
    const PaymentReceived = require("../../PaymentReceived/Model/PaymentReceivedModel");
    const ManualJournalService = require("../../Ledger/Service/ManualJournalService");
    const Customer = require("../../Customer/Model/CustomerModel");
    const AccountingCode = require("../../AccountingCode/Model/AccountingCodeModel");

    const customerId = (typeof rawCustomerId === 'object' && rawCustomerId !== null)
        ? (rawCustomerId._id || rawCustomerId.id)
        : rawCustomerId;

    const {
        bankAccountingCodeId,
        bankTransactionId,
        bankAccountId: inputBankAccountId,
        branchId: inputBranchId,
        entryDate = new Date(),
        description = "",
        transactionId,
        createdBy,
        creatorRole = "ADMIN"
    } = options;

    let branchId = inputBranchId;
    if (!branchId) {
        try {
            const Branch = require("../../Branch/Model/BranchModel");
            const defaultBranch = await Branch.findOne({ isDeleted: { $ne: true } });
            if (defaultBranch) branchId = defaultBranch._id;
        } catch (bErr) {
            console.error("[autoSetOffInvoices] Failed to resolve default branch:", bErr);
        }
    }

    const customerDoc = await Customer.findById(customerId);
    const customerName = customerDoc ? customerDoc.name : "Unknown Customer";

    console.log(`\n===============================================================`);
    console.log(`[AUTO SET-OFF ENGINE] Initializing Auto Set-off`);
    console.log(`  • Customer ID: ${customerId}`);
    console.log(`  • Customer Name: "${customerName}"`);
    console.log(`  • Payment Amount: $${amount}`);
    console.log(`  • Transaction Ref: ${transactionId || 'N/A'}`);
    console.log(`  • Entry Date: ${new Date(entryDate).toISOString()}`);
    console.log(`---------------------------------------------------------------`);

    const customerObjIds = [customerId];
    if (mongoose.Types.ObjectId.isValid(customerId)) {
        customerObjIds.push(new mongoose.Types.ObjectId(customerId));
    }

    // Fetch unpaid invoices: PARTIAL first, then OVERDUE & PENDING (oldest dueDate first)
    const unpaidInvoices = await Invoice.find({
        customer: { $in: customerObjIds },
        status: { $in: ["PARTIAL", "PENDING", "OVERDUE", "partial", "pending", "overdue"] },
        balance: { $gt: 0.01 },
        isDeleted: { $ne: true }
    });

    console.log(`[AUTO SET-OFF STAGE 1] DB Query result for customer "${customerName}": Found ${unpaidInvoices.length} unpaid invoice(s).`);
    unpaidInvoices.forEach((inv, i) => {
        const invBal = inv.balance !== undefined ? inv.balance : (inv.totalAmountDue - (inv.amountPaid || 0));
        console.log(`  📌 [${i + 1}] Invoice #${inv.invoiceNumber} | ID: ${inv._id} | Status: ${inv.status} | Total Due: $${inv.totalAmountDue} | Paid: $${inv.amountPaid || 0} | Balance: $${invBal} | Due Date: ${inv.dueDate ? new Date(inv.dueDate).toISOString().split('T')[0] : 'N/A'}`);
    });

    const getISTNow = () => {
        const now = new Date();
        return new Date(now.getTime() + (5.5 * 60 * 60 * 1000) + (now.getTimezoneOffset() * 60 * 1000));
    };
    const timestamp = entryDate ? (entryDate instanceof Date ? entryDate : new Date(entryDate)) : getISTNow();

    // Helper to determine if an invoice is overdue
    const isOverdue = (inv) => {
        const st = String(inv.status || "").toUpperCase();
        if (st === "OVERDUE") return true;
        if (inv.dueDate) {
            const dDate = new Date(inv.dueDate);
            return dDate < timestamp;
        }
        return false;
    };

    // Priority 1: OVERDUE invoices (oldest dueDate first)
    const overdueInvoices = unpaidInvoices
        .filter(inv => isOverdue(inv))
        .sort((a, b) => new Date(a.dueDate || 0) - new Date(b.dueDate || 0));

    // Priority 2: Non-overdue PARTIAL invoices (oldest dueDate first)
    const nonOverduePartialInvoices = unpaidInvoices
        .filter(inv => !isOverdue(inv) && String(inv.status).toUpperCase() === "PARTIAL")
        .sort((a, b) => new Date(a.dueDate || 0) - new Date(b.dueDate || 0));

    // Priority 3: Non-overdue PENDING invoices (oldest dueDate first)
    const nonOverduePendingInvoices = unpaidInvoices
        .filter(inv => !isOverdue(inv) && String(inv.status).toUpperCase() !== "PARTIAL")
        .sort((a, b) => new Date(a.dueDate || 0) - new Date(b.dueDate || 0));

    let sortedInvoices = [...overdueInvoices, ...nonOverduePartialInvoices, ...nonOverduePendingInvoices];

    // Priority 0: Explicitly targeted invoice if specified
    const targetInvId = options.targetInvoiceId || options.invoiceId;
    if (targetInvId) {
        const targetIdx = sortedInvoices.findIndex(inv => String(inv._id) === String(targetInvId));
        if (targetIdx > -1) {
            const [targetInv] = sortedInvoices.splice(targetIdx, 1);
            sortedInvoices.unshift(targetInv);
        }
    }

    console.log(`[AUTO SET-OFF STAGE 2] Priority Order for Set-off (${sortedInvoices.length} invoice(s)):`);
    sortedInvoices.forEach((inv, idx) => {
        console.log(`  ${idx + 1}. #${inv.invoiceNumber} (${inv.status}${isOverdue(inv) ? ' - OVERDUE' : ''}) - Due Date: ${inv.dueDate ? new Date(inv.dueDate).toISOString().split('T')[0] : 'N/A'}`);
    });

    let remainingAmount = Number(amount);
    const invoicesSetOff = [];
    let totalSetOff = 0;

    // Resolve Accounts Receivable & Advance Received accounting codes
    const arCodeDoc = await AccountingCode.findOne({
        $or: [
            { code: "1.1.03" },
            { name: { $regex: /Accounts Receivable/i } },
            { name: { $regex: /Cuenta por Cobrar/i } }
        ],
        isDeleted: { $ne: true }
    });

    const advanceCodeDoc = await AccountingCode.findOne({
        $or: [
            { code: "2.1.02" },
            { name: { $regex: /Advance Received From Customer/i } },
            { name: { $regex: /Anticipo de Cliente/i } }
        ],
        isDeleted: { $ne: true }
    });

    for (const invoice of sortedInvoices) {
        if (remainingAmount <= 0.01) break;

        const invoiceBalance = invoice.balance !== undefined ? invoice.balance : (invoice.totalAmountDue - (invoice.amountPaid || 0));
        if (invoiceBalance <= 0.01 || String(invoice.status).toUpperCase() === "PAID") continue;

        const amountToApply = Math.min(remainingAmount, invoiceBalance);

        // Capture BEFORE state (before this transaction is applied)
        const beforeState = {
            amountPaid: invoice.amountPaid || 0,
            balance: invoice.balance !== undefined ? invoice.balance : (invoice.totalAmountDue - (invoice.amountPaid || 0)),
            status: invoice.status || "PENDING",
            paidAt: invoice.paidAt || null,
        };

        const newPaid = (invoice.amountPaid || 0) + amountToApply;
        const newBalance = Math.max(0, invoice.totalAmountDue - newPaid);
        let newStatus = "PENDING";
        if (newBalance <= 0) {
            newStatus = "PAID";
        } else if (invoice.dueDate && new Date(invoice.dueDate) < timestamp) {
            newStatus = "OVERDUE";
        } else if (newPaid > 0) {
            newStatus = "PARTIAL";
        }

        console.log(`[AUTO SET-OFF STAGE 3] Executing Set-off on Invoice #${invoice.invoiceNumber}:`);
        console.log(`  • Original Balance: $${invoiceBalance}`);
        console.log(`  • Amount Applied: $${amountToApply}`);
        console.log(`  • New Total Paid: $${newPaid}`);
        console.log(`  • New Remaining Balance: $${newBalance}`);
        console.log(`  • New Invoice Status: ${newStatus}`);

        // Add payment record to the invoice
        const paymentRecord = {
            amount: amountToApply,
            paidAt: timestamp,
            paymentMethod: "Bank Transfer",
            transactionId: transactionId || undefined,
            note: description || `Auto set-off from bank statement upload`,
        };

        invoice.amountPaid = newPaid;
        invoice.balance = newBalance;
        invoice.status = newStatus;
        invoice.payments.push(paymentRecord);
        if (newStatus === "PAID" && !invoice.paidAt) {
            invoice.paidAt = timestamp;
        }
        await invoice.save();

        const addedPayment = invoice.payments && invoice.payments.length > 0
            ? invoice.payments[invoice.payments.length - 1]
            : null;

        // Capture AFTER state (after this transaction is applied)
        const afterState = {
            amountPaid: newPaid,
            balance: newBalance,
            status: newStatus,
            paidAt: invoice.paidAt || null,
        };

        // Sync with Service Bill if it's a workshop invoice
        if (invoice.invoiceType === 'WORKSHOP' && invoice.serviceBill) {
            try {
                const { ServiceBill } = require("../../ServiceBill/Model/ServiceBillModel");
                const bill = await ServiceBill.findById(invoice.serviceBill);
                if (bill) {
                    const newBillAmountPaid = (bill.amountPaid || 0) + amountToApply;
                    const newBillPaymentStatus = newBillAmountPaid >= bill.totalAmount - 0.01 ? "PAID" : "PARTIAL";
                    await ServiceBill.findByIdAndUpdate(bill._id, {
                        $inc: { amountPaid: amountToApply },
                        $push: {
                            payments: {
                                amount: amountToApply,
                                paidAt: timestamp,
                                paymentMethod: "Bank Transfer",
                                paymentReference: transactionId,
                                notes: `Auto set-off from bank statement for Invoice ${invoice.invoiceNumber}`,
                                recordedBy: createdBy
                            }
                        },
                        $set: {
                            paymentStatus: newBillPaymentStatus,
                            status: newBillPaymentStatus === "PAID" ? "PAID" : bill.status,
                            paidAt: newBillPaymentStatus === "PAID" ? timestamp : bill.paidAt
                        }
                    });
                    console.log(`  ✓ Synced ServiceBill ${invoice.serviceBill} for Invoice #${invoice.invoiceNumber}`);
                }
            } catch (billErr) {
                console.error(`[autoSetOffInvoices] Failed to sync bill for invoice ${invoice.invoiceNumber}:`, billErr);
            }
        }

        invoicesSetOff.push({
            invoiceId: invoice._id,
            invoiceNumber: invoice.invoiceNumber,
            amountApplied: amountToApply,
            paymentId: addedPayment ? addedPayment._id : undefined,
            newStatus,
            newBalance,
            beforeState,
            afterState
        });

        totalSetOff += amountToApply;
        remainingAmount -= amountToApply;
    }

    const excessAmount = Math.max(0, remainingAmount);

    if (excessAmount > 0.01) {
        console.log(`[AUTO SET-OFF STAGE 4] Excess amount of $${excessAmount.toFixed(2)} categorized as Customer Advance (Account 2.1.02)`);
    } else {
        console.log(`[AUTO SET-OFF STAGE 4] Payment fully consumed by open invoices. Zero excess advance.`);
    }

    // Create PaymentReceived record (Full amount received, keeping track of set-off vs unapplied advance)
    let prDoc = null;
    try {
        const prData = {
            paymentNumber: `PR-${Date.now()}`,
            customerId: customerId,
            amountReceived: amount,
            paymentDate: timestamp,
            paymentMethod: "Bank Transfer",
            referenceNumber: transactionId || undefined,
            notes: description || (invoicesSetOff.length > 0
                ? `Auto set-off from bank statement (${invoicesSetOff.length} invoice(s))${excessAmount > 0.01 ? ` + Advance: $${excessAmount.toFixed(2)}` : ''}`
                : `Customer advance payment (${customerName})`),
            depositedTo: bankAccountingCodeId || undefined,
            branch: branchId || undefined,
            invoices: invoicesSetOff.map(inv => ({
                invoiceId: inv.invoiceId,
                invoiceNumber: inv.invoiceNumber,
                amountApplied: inv.amountApplied
            })),
            status: "COMPLETED"
        };
        prDoc = await PaymentReceived.create(prData);
        console.log(`[AUTO SET-OFF STAGE 5] Created PaymentReceived ${prDoc.paymentNumber} for $${amount}`);
    } catch (prErr) {
        console.error("[autoSetOffInvoices] Failed to create PaymentReceived:", prErr);
    }

    // Create double-entry ledger:
    // Leg 1: DR Bank Account (Full amount)
    // Leg 2: CR Accounts Receivable (1.1.03) -> totalSetOff amount
    // Leg 3: CR Advance Received (2.1.02) -> excessAmount
    const targetArCode = arCodeDoc
        || await AccountingCode.findOne({ code: "1.1.03", isDeleted: { $ne: true } })
        || await AccountingCode.findOne({ code: "1200", isDeleted: { $ne: true } })
        || await AccountingCode.findOne({ name: { $regex: /Accounts Receivable|Cuenta por Cobrar/i }, isDeleted: { $ne: true } });

    const targetAdvCode = advanceCodeDoc
        || await AccountingCode.findOne({ code: "2.1.02", isDeleted: { $ne: true } })
        || await AccountingCode.findOne({ name: { $regex: /Advance Received|Anticipo/i }, isDeleted: { $ne: true } })
        || targetArCode;

    let createdJournalId = null;
    if (targetArCode || targetAdvCode) {
        try {
            const invoiceNumbers = invoicesSetOff.length > 0
                ? invoicesSetOff.map(inv => inv.invoiceNumber).join(", ")
                : "No open invoices";
            const prNumber = prDoc ? prDoc.paymentNumber : "PR-Pending";

            const formattedInvoicesForLedger = invoicesSetOff.map(inv => ({
                invoiceId: inv.invoiceId,
                invoiceNumber: inv.invoiceNumber,
                amountApplied: inv.amountApplied
            }));

            const formattedSetOffSummary = {
                totalSetOff: totalSetOff,
                invoiceCount: invoicesSetOff.length,
                excessAmount: excessAmount
            };

            const LedgerEntry = require("../../Ledger/Model/LedgerEntryModel");
            const createdPartnerEntryIds = [];

            // Leg 2: CREDIT Accounts Receivable (for invoice set-off portion)
            if (totalSetOff > 0 && targetArCode) {
                const arEntry = await LedgerEntry.create({
                    branch: branchId,
                    accountingCode: targetArCode._id,
                    type: "CREDIT",
                    amount: totalSetOff,
                    description: `Invoice set-off payment (${invoiceNumbers}) - Customer: ${customerName}`,
                    contact: customerId,
                    transactionId: transactionId,
                    entryDate: timestamp,
                    createdBy: createdBy || "6a2290019fa01283dd165204",
                    creatorRole: (creatorRole || "ADMIN").toUpperCase()
                });
                if (arEntry) createdPartnerEntryIds.push(arEntry._id);
            }

            // Leg 3: CREDIT Advance Received From Customer (2.1.02) for excess amount
            if (excessAmount > 0 && targetAdvCode) {
                const advEntry = await LedgerEntry.create({
                    branch: branchId,
                    accountingCode: targetAdvCode._id,
                    type: "CREDIT",
                    amount: excessAmount,
                    description: `Advance Received from Customer: ${customerName} | Payment Ref: ${prNumber} | Advance Amount: $${excessAmount.toFixed(2)}`,
                    contact: customerId,
                    transactionId: transactionId,
                    entryDate: timestamp,
                    createdBy: createdBy || "6a2290019fa01283dd165204",
                    creatorRole: (creatorRole || "ADMIN").toUpperCase()
                });
                if (advEntry) createdPartnerEntryIds.push(advEntry._id);
            }

            console.log(`[AUTO SET-OFF STAGE 6] Direct Double-Entry Ledger Created successfully (Bank DR $${amount}, AR CR $${totalSetOff}, Advance 2.1.02 CR $${excessAmount})`);

            // Sync accounting code balances
            if (bankAccountingCodeId) await syncAccountingCodeBalances(bankAccountingCodeId);
            if (targetArCode) await syncAccountingCodeBalances(targetArCode._id);
            if (targetAdvCode) await syncAccountingCodeBalances(targetAdvCode._id);

            // Store partner entry IDs in options for history saving
            options.createdPartnerEntryIds = createdPartnerEntryIds;
        } catch (ledgerErr) {
            console.error("[autoSetOffInvoices] Failed to create ledger entries:", ledgerErr);
        }
    }

    // Save or Update InvoiceSetOffHistory
    let historyDoc = null;
    const primaryTxId = bankTransactionId || options.existingBankLedgerEntryId || options.primaryLedgerEntry;
    if (primaryTxId) {
        try {
            const InvoiceSetOffHistory = require("../Model/InvoiceSetOffHistoryModel");

            const historySnapshots = invoicesSetOff.map(inv => ({
                invoice: inv.invoiceId,
                invoiceNumber: inv.invoiceNumber,
                amountApplied: inv.amountApplied,
                paymentId: inv.paymentId,
                before: inv.beforeState,
                after: inv.afterState
            }));

            const partnerEntryIds = options.createdPartnerEntryIds || [];

            const existingHistory = await InvoiceSetOffHistory.findOne({
                $or: [
                    { primaryLedgerEntry: primaryTxId },
                    { partnerLedgerEntries: primaryTxId },
                    ...(transactionId ? [{ transactionId: String(transactionId) }] : [])
                ]
            });

            if (existingHistory) {
                // UPDATE existing: keep BEFORE data, update AFTER data
                existingHistory.primaryLedgerEntry = primaryTxId;
                existingHistory.customer = customerId;
                existingHistory.transactionAmount = Number(amount);
                existingHistory.entryDate = entryDate instanceof Date ? entryDate : new Date(entryDate);
                existingHistory.transactionId = transactionId;
                existingHistory.invoiceSnapshots = historySnapshots;
                existingHistory.excessAmount = excessAmount;
                existingHistory.paymentReceived = prDoc ? prDoc._id : undefined;
                existingHistory.partnerLedgerEntries = partnerEntryIds.length > 0 ? partnerEntryIds : existingHistory.partnerLedgerEntries;
                await existingHistory.save();
                historyDoc = existingHistory;
                console.log(`[AUTO SET-OFF HISTORY] Updated existing InvoiceSetOffHistory ${existingHistory._id} for Primary LedgerEntry ${primaryTxId}`);
            } else {
                // CREATE new history
                historyDoc = await InvoiceSetOffHistory.create({
                    primaryLedgerEntry: primaryTxId,
                    bankAccount: inputBankAccountId || undefined,
                    customer: customerId,
                    transactionAmount: Number(amount),
                    entryDate: entryDate instanceof Date ? entryDate : new Date(entryDate),
                    transactionId: transactionId,
                    invoiceSnapshots: historySnapshots,
                    excessAmount: excessAmount,
                    paymentReceived: prDoc ? prDoc._id : undefined,
                    partnerLedgerEntries: partnerEntryIds,
                    createdBy: createdBy || "6a2290019fa01283dd165204",
                    creatorRole: (creatorRole || "ADMIN").toUpperCase()
                });
                console.log(`[AUTO SET-OFF HISTORY] Created InvoiceSetOffHistory ${historyDoc._id} for Primary LedgerEntry ${primaryTxId}`);
            }
        } catch (historyErr) {
            console.error("[autoSetOffInvoices] Failed to save InvoiceSetOffHistory:", historyErr);
        }
    }


    console.log(`[AUTO SET-OFF SUMMARY] Process Complete for "${customerName}":`);
    console.log(`  ✓ Total Invoices Set-off: ${invoicesSetOff.length}`);
    console.log(`  ✓ Total Amount Set-off: $${totalSetOff}`);
    console.log(`  ✓ Excess Advance Amount: $${excessAmount}`);
    console.log(`===============================================================\n`);

    return {
        invoicesSetOff,
        totalSetOff,
        excessAmount,
        paymentReceived: prDoc ? { paymentNumber: prDoc.paymentNumber, _id: prDoc._id } : null,
        historyId: historyDoc ? historyDoc._id : null
    };
};

/**
 * Auto set-off Supplier Bills for outgoing credit bank transactions (withdrawals / payments to vendor).
 * Automatically applies payment to open/partially-paid Bills (oldest due date first).
 * Records an InvoiceBillSetOffHistory document with targetType: "SUPPLIER".
 *
 * @param {ObjectId} supplierId - The Supplier document _id
 * @param {Number} amount - The transaction amount (credit / withdrawal)
 * @param {Object} options - Branch, entryDate, description, transactionId, etc.
 */
const autoSetOffBills = async (supplierId, amount, options = {}) => {
    const Supplier = require("../../Supplier/Model/SupplierModel");
    const Bill = require("../../Bill/Model/BillModel");
    const PaymentMade = require("../../PaymentMade/Model/PaymentMadeModel");
    const LedgerEntry = require("../../Ledger/Model/LedgerEntryModel");
    const AccountingCode = require("../../AccountingCode/Model/AccountingCodeModel");
    const InvoiceBillSetOffHistory = require("../Model/InvoiceBillSetOffHistoryModel");

    const {
        bankAccountingCodeId,
        bankTransactionId,
        bankAccountId,
        branchId,
        entryDate,
        description,
        transactionId,
        createdBy,
        creatorRole,
        inputBankAccountId
    } = options;

    const inputBranchId = branchId || options.branchId || options.branch || undefined;

    const supplierDoc = await Supplier.findById(supplierId);
    const supplierName = supplierDoc ? (supplierDoc.name || supplierDoc.companyName || "Unknown Vendor") : "Unknown Vendor";

    console.log(`\n===============================================================`);
    console.log(`[VENDOR AUTO SET-OFF ENGINE] Initializing Auto Set-off for Bills`);
    console.log(`  • Supplier ID: ${supplierId}`);
    console.log(`  • Supplier Name: "${supplierName}"`);
    console.log(`  • Payment Amount: $${amount}`);
    console.log(`  • Transaction Ref: ${transactionId || 'N/A'}`);
    console.log(`  • Entry Date: ${entryDate ? new Date(entryDate).toISOString() : new Date().toISOString()}`);
    console.log(`---------------------------------------------------------------`);

    // Fetch unpaid bills for supplier: OPEN, PARTIALLY_PAID, DRAFT with balanceDue > 0.01
    const unpaidBills = await Bill.find({
        supplier: supplierId,
        status: { $in: ["OPEN", "PARTIALLY_PAID", "DRAFT", "open", "partially_paid", "draft"] },
        balanceDue: { $gt: 0.01 },
        isDeleted: { $ne: true }
    });

    console.log(`[VENDOR SET-OFF STAGE 1] DB Query for vendor "${supplierName}": Found ${unpaidBills.length} unpaid bill(s).`);

    const timestamp = entryDate ? (entryDate instanceof Date ? entryDate : new Date(entryDate)) : new Date();

    const isOverdue = (bill) => {
        if (bill.dueDate) {
            return new Date(bill.dueDate) < timestamp;
        }
        return false;
    };

    // Priority 1: Overdue bills (oldest dueDate first)
    const overdueBills = unpaidBills
        .filter(b => isOverdue(b))
        .sort((a, b) => new Date(a.dueDate || a.billDate || 0) - new Date(b.dueDate || b.billDate || 0));

    // Priority 2: Non-overdue PARTIALLY_PAID bills
    const partialBills = unpaidBills
        .filter(b => !isOverdue(b) && String(b.status).toUpperCase().includes("PARTIAL"))
        .sort((a, b) => new Date(a.dueDate || a.billDate || 0) - new Date(b.dueDate || b.billDate || 0));

    // Priority 3: Non-overdue OPEN/DRAFT bills
    const openBills = unpaidBills
        .filter(b => !isOverdue(b) && !String(b.status).toUpperCase().includes("PARTIAL"))
        .sort((a, b) => new Date(a.dueDate || a.billDate || 0) - new Date(b.dueDate || b.billDate || 0));

    let sortedBills = [...overdueBills, ...partialBills, ...openBills];

    // Priority 0: Explicitly targeted bill if specified
    const targetBillId = options.targetBillId || options.billId;
    if (targetBillId) {
        const targetIdx = sortedBills.findIndex(b => String(b._id) === String(targetBillId));
        if (targetIdx > -1) {
            const [targetB] = sortedBills.splice(targetIdx, 1);
            sortedBills.unshift(targetB);
        }
    }

    let remainingAmount = Number(amount);
    const billsSetOff = [];
    let totalSetOff = 0;

    for (const billDoc of sortedBills) {
        if (remainingAmount <= 0.01) break;

        const billBalance = billDoc.balanceDue !== undefined ? billDoc.balanceDue : (billDoc.totalAmount - (billDoc.amountPaid || 0));
        if (billBalance <= 0.01 || String(billDoc.status).toUpperCase() === "PAID") continue;

        const amountToApply = Math.min(remainingAmount, billBalance);

        // Capture BEFORE state
        const beforeState = {
            amountPaid: billDoc.amountPaid || 0,
            balance: billBalance,
            status: billDoc.status || "OPEN",
            paidAt: billDoc.paidAt || null,
        };

        const newPaid = (billDoc.amountPaid || 0) + amountToApply;
        const newBalance = Math.max(0, billDoc.totalAmount - newPaid);
        let newStatus = "OPEN";
        if (newBalance <= 0.01) {
            newStatus = "PAID";
        } else if (newPaid > 0) {
            newStatus = "PARTIALLY_PAID";
        }

        billDoc.amountPaid = newPaid;
        billDoc.balanceDue = newBalance;
        billDoc.status = newStatus;
        if (newStatus === "PAID") {
            billDoc.paidAt = timestamp;
        }

        billDoc.payments = billDoc.payments || [];
        billDoc.payments.push({
            amount: amountToApply,
            paidAt: timestamp,
            paymentMethod: options.paymentMethod || "Bank Transfer",
            transactionId: transactionId || undefined,
            note: description || "Auto set-off from bank statement upload"
        });

        await billDoc.save();

        const addedPayment = billDoc.payments && billDoc.payments.length > 0
            ? billDoc.payments[billDoc.payments.length - 1]
            : null;

        const afterState = {
            amountPaid: newPaid,
            balance: newBalance,
            status: newStatus,
            paidAt: billDoc.paidAt || null,
        };

        billsSetOff.push({
            billId: billDoc._id,
            billNumber: billDoc.billNumber,
            amountApplied: amountToApply,
            paymentId: addedPayment ? addedPayment._id : undefined,
            beforeState,
            afterState,
        });

        remainingAmount -= amountToApply;
        totalSetOff += amountToApply;
    }

    const excessAmount = Math.max(0, remainingAmount);

    // Save PaymentMade record
    let paymentMadeDoc = null;
    try {
        const pmNumber = `PM-${Date.now()}`;
        paymentMadeDoc = await PaymentMade.create({
            paymentNumber: pmNumber,
            supplier: supplierId,
            amount: Number(amount),
            paymentDate: timestamp,
            paymentMethod: "Bank Transfer",
            referenceNumber: transactionId || undefined,
            notes: description || `Auto set-off from bank statement upload`,
            bills: billsSetOff.map(b => ({
                billId: b.billId,
                billNumber: b.billNumber,
                amountApplied: b.amountApplied
            }))
        });
    } catch (pmErr) {
        console.error("[autoSetOffBills] Failed to create PaymentMade record:", pmErr);
    }

    // Create double-entry ledger for Vendor payment:
    // Leg 2: DEBIT Accounts Payable (2.1.01) -> totalSetOff amount
    // Leg 3: DEBIT Vendor Advance (1.1.04) -> excessAmount
    const apCodeDoc = await AccountingCode.findOne({
        $or: [
            { code: "2.1.01" },
            { name: { $regex: /Accounts Payable|Cuentas por Pagar/i } }
        ],
        isDeleted: { $ne: true }
    });

    const vendorAdvCodeDoc = await AccountingCode.findOne({
        $or: [
            { code: "1.1.04" },
            { name: { $regex: /Vendor Advance|Supplier Advance|Anticipo.*Proveedores/i } }
        ],
        isDeleted: { $ne: true }
    });

    const createdPartnerEntryIds = [];
    if (totalSetOff > 0 && apCodeDoc) {
        try {
            const billNumbers = billsSetOff.map(b => b.billNumber).join(", ");
            const apEntry = await LedgerEntry.create({
                branch: inputBranchId,
                accountingCode: apCodeDoc._id,
                type: "DEBIT",
                amount: totalSetOff,
                description: `Vendor Bill set-off payment (${billNumbers})`,
                supplier: supplierId,
                transactionId: transactionId,
                entryDate: timestamp,
                createdBy: createdBy || "6a2290019fa01283dd165204",
                creatorRole: (creatorRole || "ADMIN").toUpperCase()
            });
            if (apEntry) createdPartnerEntryIds.push(apEntry._id);
        } catch (apErr) {
            console.error("[autoSetOffBills] Failed to create AP ledger entry:", apErr);
        }
    }

    if (excessAmount > 0 && vendorAdvCodeDoc) {
        try {
            const pmNum = paymentMadeDoc ? paymentMadeDoc.paymentNumber : "PM-Pending";
            const advEntry = await LedgerEntry.create({
                branch: inputBranchId,
                accountingCode: vendorAdvCodeDoc._id,
                type: "DEBIT",
                amount: excessAmount,
                description: `Vendor Advance Payment | Ref: ${pmNum} | Amount: $${excessAmount.toFixed(2)}`,
                supplier: supplierId,
                transactionId: transactionId,
                entryDate: timestamp,
                createdBy: createdBy || "6a2290019fa01283dd165204",
                creatorRole: (creatorRole || "ADMIN").toUpperCase()
            });
            if (advEntry) createdPartnerEntryIds.push(advEntry._id);
        } catch (advErr) {
            console.error("[autoSetOffBills] Failed to create Vendor Advance ledger entry:", advErr);
        }
    }

    // Save InvoiceBillSetOffHistory with targetType: "SUPPLIER"
    let historyDoc = null;
    const primaryTxId = bankTransactionId || options.existingBankLedgerEntryId || options.primaryLedgerEntry;
    if (primaryTxId) {
        try {
            const billSnapshots = billsSetOff.map(b => ({
                bill: b.billId,
                billNumber: b.billNumber,
                amountApplied: b.amountApplied,
                paymentId: b.paymentId,
                before: b.beforeState,
                after: b.afterState
            }));

            const existingHistory = await InvoiceBillSetOffHistory.findOne({
                $or: [
                    { primaryLedgerEntry: primaryTxId },
                    { partnerLedgerEntries: primaryTxId },
                    ...(transactionId ? [{ transactionId: String(transactionId) }] : [])
                ]
            });

            if (existingHistory) {
                existingHistory.primaryLedgerEntry = primaryTxId;
                existingHistory.targetType = "SUPPLIER";
                existingHistory.supplier = supplierId;
                existingHistory.transactionAmount = Number(amount);
                existingHistory.entryDate = timestamp;
                existingHistory.transactionId = transactionId;
                existingHistory.billSnapshots = billSnapshots;
                existingHistory.excessAmount = excessAmount;
                existingHistory.vendorPayment = paymentMadeDoc ? paymentMadeDoc._id : undefined;
                existingHistory.partnerLedgerEntries = createdPartnerEntryIds.length > 0 ? createdPartnerEntryIds : existingHistory.partnerLedgerEntries;
                await existingHistory.save();
                historyDoc = existingHistory;
            } else {
                historyDoc = await InvoiceBillSetOffHistory.create({
                    primaryLedgerEntry: primaryTxId,
                    bankAccount: inputBankAccountId || undefined,
                    targetType: "SUPPLIER",
                    supplier: supplierId,
                    transactionAmount: Number(amount),
                    entryDate: timestamp,
                    transactionId: transactionId,
                    billSnapshots: billSnapshots,
                    excessAmount: excessAmount,
                    vendorPayment: paymentMadeDoc ? paymentMadeDoc._id : undefined,
                    partnerLedgerEntries: createdPartnerEntryIds,
                    createdBy: createdBy || "6a2290019fa01283dd165204",
                    creatorRole: (creatorRole || "ADMIN").toUpperCase()
                });
            }
        } catch (histErr) {
            console.error("[autoSetOffBills] Failed to save InvoiceBillSetOffHistory:", histErr);
        }
    }

    return {
        billsSetOff,
        totalSetOff,
        excessAmount,
        vendorPayment: paymentMadeDoc ? { paymentNumber: paymentMadeDoc.paymentNumber, _id: paymentMadeDoc._id } : null,
        historyId: historyDoc ? historyDoc._id : null
    };
};

/**
 * Reverse invoice or bill set-offs for a bank transaction using InvoiceBillSetOffHistory.
 * Restores each invoice or bill to its exact BEFORE state from the history record.
 * Deletes associated PaymentReceived / PaymentMade and ledger entries.
 *
 * @param {ObjectId} bankTransactionId - The Primary LedgerEntry _id or transaction ID
 * @returns {Object|null} The history document, or null if no history found
 */
const reverseSetOffFromHistory = async (bankTransactionId) => {
    const InvoiceBillSetOffHistory = require("../Model/InvoiceBillSetOffHistoryModel");
    const BankTransaction = require("../Model/BankTransactionModel");
    const LedgerEntry = require("../../Ledger/Model/LedgerEntryModel");
    const { Invoice } = require("../../Invoice/Model/InvoiceModel");
    const Bill = require("../../Bill/Model/BillModel");
    const PaymentReceived = require("../../PaymentReceived/Model/PaymentReceivedModel");
    const PaymentMade = require("../../PaymentMade/Model/PaymentMadeModel");

    if (!bankTransactionId) return null;

    let bankTx = null;
    let primaryEntry = null;
    const txStringId = String(bankTransactionId);

    if (mongoose.Types.ObjectId.isValid(bankTransactionId)) {
        bankTx = await BankTransaction.findById(bankTransactionId);
        if (bankTx && bankTx.ledgerEntry) {
            primaryEntry = await LedgerEntry.findById(bankTx.ledgerEntry);
        } else if (!bankTx) {
            primaryEntry = await LedgerEntry.findById(bankTransactionId);
            if (primaryEntry) {
                bankTx = await BankTransaction.findOne({
                    $or: [
                        { ledgerEntry: primaryEntry._id },
                        { transactionId: primaryEntry.transactionId }
                    ]
                });
            }
        }
    }

    if (!primaryEntry && bankTx && bankTx.ledgerEntry) {
        primaryEntry = await LedgerEntry.findById(bankTx.ledgerEntry);
    }
    if (!primaryEntry && !bankTx) {
        primaryEntry = await LedgerEntry.findOne({ transactionId: txStringId });
        if (primaryEntry) {
            bankTx = await BankTransaction.findOne({
                $or: [
                    { ledgerEntry: primaryEntry._id },
                    { transactionId: primaryEntry.transactionId }
                ]
            });
        }
    }

    const searchConditions = [];
    if (mongoose.Types.ObjectId.isValid(bankTransactionId)) {
        searchConditions.push({ _id: bankTransactionId });
        searchConditions.push({ primaryLedgerEntry: bankTransactionId });
        searchConditions.push({ partnerLedgerEntries: bankTransactionId });
        searchConditions.push({ bankTransaction: bankTransactionId });
    }
    if (primaryEntry) {
        searchConditions.push({ primaryLedgerEntry: primaryEntry._id });
        searchConditions.push({ partnerLedgerEntries: primaryEntry._id });
    }
    if (bankTx) {
        searchConditions.push({ bankTransaction: bankTx._id });
        if (bankTx.ledgerEntry) searchConditions.push({ primaryLedgerEntry: bankTx.ledgerEntry });
    }
    if (txStringId) searchConditions.push({ transactionId: txStringId });
    if (primaryEntry && primaryEntry.transactionId) searchConditions.push({ transactionId: primaryEntry.transactionId });
    if (bankTx && bankTx.transactionId) searchConditions.push({ transactionId: bankTx.transactionId });

    const history = await InvoiceBillSetOffHistory.findOne({ $or: searchConditions });

    if (!history) {
        console.log(`[reverseSetOffFromHistory] No InvoiceBillSetOffHistory found for ${bankTransactionId}. Cleaning orphan partner entries if any.`);
        const orphanTxId = (bankTx && bankTx.transactionId) || (primaryEntry && primaryEntry.transactionId) || txStringId;
        const primaryId = primaryEntry ? primaryEntry._id : (bankTx ? bankTx.ledgerEntry : null);
        if (orphanTxId && primaryId) {
            await LedgerEntry.deleteMany({
                transactionId: String(orphanTxId),
                _id: { $ne: primaryId }
            });
        }
        return null;
    }

    console.log(`\n===============================================================`);
    console.log(`[REVERSE SET-OFF] Reversing set-off for BankTransaction ${bankTransactionId}`);
    console.log(`  • History ID: ${history._id}`);
    console.log(`  • Target Type: ${history.targetType || 'CUSTOMER'}`);
    console.log(`  • Transaction Amount: $${history.transactionAmount}`);
    console.log(`---------------------------------------------------------------`);

    if (history.targetType === "SUPPLIER" || (history.billSnapshots && history.billSnapshots.length > 0)) {
        // Reverse Supplier Bill Set-Off
        const txId = history.transactionId || (bankTx && bankTx.transactionId) || (primaryEntry && primaryEntry.transactionId) || String(bankTransactionId);
        const billIdsToUpdate = new Set();

        (history.billSnapshots || []).forEach(b => {
            if (b.bill) billIdsToUpdate.add(String(b.bill));
        });

        if (history.supplier) {
            const suppBills = await Bill.find({ supplier: history.supplier });
            suppBills.forEach(b => {
                const hasMatchingPayment = (b.payments || []).some(p =>
                    (txId && String(p.transactionId) === String(txId)) ||
                    (bankTransactionId && String(p.transactionId) === String(bankTransactionId)) ||
                    (history.vendorPayment && String(p.paymentMadeId || p.transactionId || '') === String(history.vendorPayment))
                );
                if (hasMatchingPayment) {
                    billIdsToUpdate.add(String(b._id));
                }
            });
        }

        for (const bId of billIdsToUpdate) {
            try {
                const billDoc = await Bill.findById(bId);
                if (billDoc) {
                    const bSnapshot = (history.billSnapshots || []).find(s => String(s.bill) === String(bId));
                    // Remove exact connected payment from bill.payments
                    billDoc.payments = (billDoc.payments || []).filter(p => {
                        const matchSnapshotPayment = bSnapshot && bSnapshot.paymentId && String(p._id) === String(bSnapshot.paymentId);
                        const matchTxId = txId && String(p.transactionId) === String(txId);
                        const matchBankTxId = String(p.transactionId) === String(bankTransactionId);
                        const matchVendorPaymentId = history.vendorPayment && String(p.paymentMadeId || p.transactionId || '') === String(history.vendorPayment);
                        return !(matchSnapshotPayment || matchTxId || matchBankTxId || matchVendorPaymentId);
                    });

                    // Recalculate total amount paid & balance due from remaining payments
                    const newAmountPaid = (billDoc.payments || []).reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
                    const newBalanceDue = Math.max(0, (billDoc.totalAmount || 0) - newAmountPaid);
                    let newStatus = "OPEN";
                    if (newBalanceDue <= 0) {
                        newStatus = "PAID";
                    } else if (newAmountPaid > 0) {
                        newStatus = "PARTIALLY_PAID";
                    }

                    console.log(`  ↩ Dynamic Set-off Reversal on Bill #${billDoc.billNumber || bId}: amountPaid=$${newAmountPaid}, balanceDue=$${newBalanceDue}, status=${newStatus}`);
                    billDoc.amountPaid = newAmountPaid;
                    billDoc.balanceDue = newBalanceDue;
                    billDoc.status = newStatus;
                    if (newStatus !== "PAID") {
                        billDoc.paidAt = undefined;
                    }
                    await billDoc.save();
                }
            } catch (bErr) {
                console.error(`  ✗ Failed to update Bill ${bId}:`, bErr);
            }
        }

        const pmSearchConditions = [];
        if (history.vendorPayment) {
            pmSearchConditions.push({ _id: history.vendorPayment });
        }
        if (txId) {
            pmSearchConditions.push({ referenceNumber: String(txId) });
            pmSearchConditions.push({ notes: { $regex: new RegExp(escapeRegExp(String(txId)), "i") } });
        }
        if (bankTransactionId) {
            pmSearchConditions.push({ referenceNumber: String(bankTransactionId) });
            pmSearchConditions.push({ notes: { $regex: new RegExp(escapeRegExp(String(bankTransactionId)), "i") } });
        }
        if (pmSearchConditions.length > 0) {
            try {
                const delRes = await PaymentMade.deleteMany({ $or: pmSearchConditions });
                console.log(`  ✓ Deleted ${delRes.deletedCount} PaymentMade record(s) matching vendor payment / reference ${txId}`);
            } catch (pmErr) {
                console.error(`  ✗ Failed to delete PaymentMade:`, pmErr);
            }
        }
    } else {
        // Reverse Customer Invoice Set-Off
        const txId = history.transactionId || (bankTx && bankTx.transactionId) || (primaryEntry && primaryEntry.transactionId) || String(bankTransactionId);
        for (const snapshot of (history.invoiceSnapshots || [])) {
            try {
                const invoiceDoc = await Invoice.findById(snapshot.invoice);
                if (!invoiceDoc) continue;

                // Remove exact connected payment from invoice.payments
                invoiceDoc.payments = (invoiceDoc.payments || []).filter(p => {
                    const matchSnapshotPayment = snapshot.paymentId && String(p._id) === String(snapshot.paymentId);
                    const matchTxId = txId && String(p.transactionId) === String(txId);
                    const matchBankTxId = String(p.transactionId) === String(bankTransactionId);
                    const matchPRId = history.paymentReceived && String(p.paymentReceivedId || p.transactionId || '') === String(history.paymentReceived);
                    return !(matchSnapshotPayment || matchTxId || matchBankTxId || matchPRId);
                });

                // Recalculate total amount paid & balance from remaining payments
                const newAmountPaid = (invoiceDoc.payments || []).reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
                const newBalance = Math.max(0, (invoiceDoc.totalAmountDue || 0) - newAmountPaid);
                let newStatus = "PENDING";
                if (newBalance <= 0) {
                    newStatus = "PAID";
                } else if (newAmountPaid > 0) {
                    newStatus = "PARTIAL";
                } else {
                    const now = new Date();
                    if (invoiceDoc.dueDate && new Date(invoiceDoc.dueDate) < now) {
                        newStatus = "OVERDUE";
                    }
                }

                console.log(`  ↩ Dynamic Set-off Reversal on Invoice #${snapshot.invoiceNumber}: amountPaid=$${newAmountPaid}, balance=$${newBalance}, status=${newStatus}`);
                invoiceDoc.amountPaid = newAmountPaid;
                invoiceDoc.balance = newBalance;
                invoiceDoc.status = newStatus;
                if (newStatus !== "PAID") {
                    invoiceDoc.paidAt = undefined;
                }

                await invoiceDoc.save();

                if (invoiceDoc.invoiceType === 'WORKSHOP' && invoiceDoc.serviceBill) {
                    try {
                        const { ServiceBill } = require("../../ServiceBill/Model/ServiceBillModel");
                        const bill = await ServiceBill.findById(invoiceDoc.serviceBill);
                        if (bill) {
                            const revertedBillPaid = Math.max(0, (bill.amountPaid || 0) - (snapshot.amountApplied || 0));
                            const newBillPaymentStatus = revertedBillPaid >= bill.totalAmount - 0.01 ? "PAID" : (revertedBillPaid > 0 ? "PARTIAL" : "PENDING");
                            await ServiceBill.findByIdAndUpdate(bill._id, {
                                $set: {
                                    amountPaid: revertedBillPaid,
                                    paymentStatus: newBillPaymentStatus,
                                    status: newBillPaymentStatus === "PAID" ? "PAID" : bill.status
                                }
                            });
                        }
                    } catch (sbErr) {
                        console.error(`    ✗ Failed to revert ServiceBill for Invoice #${snapshot.invoiceNumber}:`, sbErr);
                    }
                }
            } catch (invErr) {
                console.error(`  ✗ Failed to restore Invoice ${snapshot.invoiceNumber}:`, invErr);
            }
        }

        if (history.paymentReceived) {
            try {
                await PaymentReceived.deleteOne({ _id: history.paymentReceived });
                console.log(`  ✓ Deleted PaymentReceived ${history.paymentReceived}`);
            } catch (prErr) {
                console.error(`  ✗ Failed to delete PaymentReceived:`, prErr);
            }
        }
    }

    // Delete partner ledger entries
    try {
        const partnerIdsToDelete = [...(history.partnerLedgerEntries || [])];
        const resolvedTxId = history.transactionId || (bankTx && bankTx.transactionId) || (primaryEntry && primaryEntry.transactionId);
        const primaryId = primaryEntry ? primaryEntry._id : history.primaryLedgerEntry;

        if (partnerIdsToDelete.length > 0) {
            await LedgerEntry.deleteMany({ _id: { $in: partnerIdsToDelete } });
        }
        if (resolvedTxId && primaryId) {
            await LedgerEntry.deleteMany({
                transactionId: String(resolvedTxId),
                _id: { $ne: primaryId }
            });
        }
        console.log(`  ✓ Deleted partner set-off LedgerEntries for ${bankTransactionId}`);
    } catch (lErr) {
        console.error(`  ✗ Failed to delete partner ledger entries:`, lErr);
    }

    // Delete history document
    try {
        await InvoiceBillSetOffHistory.deleteOne({ _id: history._id });
        console.log(`  ✓ Deleted InvoiceBillSetOffHistory ${history._id}`);
    } catch (hErr) {
        console.error(`  ✗ Failed to delete InvoiceBillSetOffHistory:`, hErr);
    }

    return history;
};

/**
 * Dedicated Service 1: Update Customer Transaction Amount
 */
const updateCustomerTransactionAmount = async (transactionId, newAmount, options = {}) => {
    const numAmount = Number(newAmount);
    if (isNaN(numAmount) || numAmount <= 0) {
        throw new Error("Amount must be a positive number");
    }

    const BankTransaction = require("../Model/BankTransactionModel");
    const LedgerEntry = require("../../Ledger/Model/LedgerEntryModel");
    const InvoiceBillSetOffHistory = require("../Model/InvoiceBillSetOffHistoryModel");

    let bankTx = null;
    let primaryEntry = null;
    const txStringId = String(transactionId);

    if (mongoose.Types.ObjectId.isValid(transactionId)) {
        bankTx = await BankTransaction.findById(transactionId);
        if (bankTx && bankTx.ledgerEntry) {
            primaryEntry = await LedgerEntry.findById(bankTx.ledgerEntry);
        } else if (!bankTx) {
            primaryEntry = await LedgerEntry.findById(transactionId);
        }
    }
    if (!primaryEntry && bankTx && bankTx.ledgerEntry) {
        primaryEntry = await LedgerEntry.findById(bankTx.ledgerEntry);
    }
    if (!primaryEntry && !bankTx) {
        primaryEntry = await LedgerEntry.findOne({ transactionId: txStringId });
    }
    if (!bankTx && primaryEntry) {
        bankTx = await BankTransaction.findOne({
            $or: [
                { ledgerEntry: primaryEntry._id },
                { transactionId: primaryEntry.transactionId }
            ]
        });
    }

    const searchConditions = [];
    if (mongoose.Types.ObjectId.isValid(transactionId)) {
        searchConditions.push({ _id: transactionId });
        searchConditions.push({ primaryLedgerEntry: transactionId });
        searchConditions.push({ partnerLedgerEntries: transactionId });
        searchConditions.push({ bankTransaction: transactionId });
    }
    if (primaryEntry) {
        searchConditions.push({ primaryLedgerEntry: primaryEntry._id });
        searchConditions.push({ partnerLedgerEntries: primaryEntry._id });
    }
    if (bankTx) {
        searchConditions.push({ bankTransaction: bankTx._id });
        if (bankTx.ledgerEntry) searchConditions.push({ primaryLedgerEntry: bankTx.ledgerEntry });
    }
    if (txStringId) searchConditions.push({ transactionId: txStringId });

    const history = await InvoiceBillSetOffHistory.findOne({ $or: searchConditions });

    const targetCustomerId = (history && history.customer)
        || (bankTx && bankTx.customer)
        || (primaryEntry && primaryEntry.contact);

    if (!targetCustomerId) {
        throw new Error("No Customer associated with this transaction");
    }

    // 1. Reverse existing set-off cleanly
    await reverseSetOffFromHistory(primaryEntry ? primaryEntry._id : (bankTx ? bankTx._id : transactionId));

    // 2. Update BankTransaction & LedgerEntry amounts
    if (primaryEntry) {
        primaryEntry.amount = numAmount;
        await primaryEntry.save();
    }
    if (bankTx) {
        bankTx.amount = numAmount;
        await bankTx.save();
    }

    // 3. Re-run autoSetOffInvoices for Customer with new amount
    const resolvedTxId = (bankTx && bankTx.transactionId) || (primaryEntry && primaryEntry.transactionId) || txStringId;
    const setOffResult = await autoSetOffInvoices(targetCustomerId, numAmount, {
        ...options,
        bankTransactionId: bankTx ? bankTx._id : undefined,
        existingBankLedgerEntryId: primaryEntry ? primaryEntry._id : undefined,
        primaryLedgerEntry: primaryEntry ? primaryEntry._id : undefined,
        entryDate: options.entryDate || (primaryEntry ? primaryEntry.entryDate : (bankTx ? bankTx.entryDate : new Date())),
        transactionId: resolvedTxId,
        createdBy: options.createdBy,
        creatorRole: options.creatorRole
    });

    // 4. Recalculate running balances
    const bankAccountId = (bankTx && bankTx.bankAccount) || (primaryEntry && primaryEntry.bankAccount);
    if (bankAccountId) {
        await recalculateRunningBalances(bankAccountId);
    }

    return {
        success: true,
        transactionId,
        newAmount: numAmount,
        customerId: targetCustomerId,
        setOffResult
    };
};

/**
 * Dedicated Service 2: Update Customer Contact
 */
const updateCustomerContact = async (transactionId, newCustomerId, options = {}) => {
    const BankTransaction = require("../Model/BankTransactionModel");
    const LedgerEntry = require("../../Ledger/Model/LedgerEntryModel");
    const Customer = require("../../Customer/Model/CustomerModel");

    let bankTx = null;
    let primaryEntry = null;

    if (mongoose.Types.ObjectId.isValid(transactionId)) {
        bankTx = await BankTransaction.findById(transactionId);
        if (bankTx && bankTx.ledgerEntry) {
            primaryEntry = await LedgerEntry.findById(bankTx.ledgerEntry);
        } else if (!bankTx) {
            primaryEntry = await LedgerEntry.findById(transactionId);
        }
    }
    if (!primaryEntry && bankTx && bankTx.ledgerEntry) {
        primaryEntry = await LedgerEntry.findById(bankTx.ledgerEntry);
    }
    if (!primaryEntry && !bankTx) {
        primaryEntry = await LedgerEntry.findOne({ transactionId: String(transactionId) });
    }
    if (!bankTx && primaryEntry) {
        bankTx = await BankTransaction.findOne({
            $or: [
                { ledgerEntry: primaryEntry._id },
                { transactionId: primaryEntry.transactionId }
            ]
        });
    }

    if (!primaryEntry && !bankTx) {
        throw new Error("Transaction not found");
    }

    // 1. Reverse existing set-off (Customer or Vendor)
    await reverseSetOffFromHistory(transactionId);

    const txAmount = bankTx ? bankTx.amount : (primaryEntry ? primaryEntry.amount : 0);

    let setOffResult = null;
    if (newCustomerId) {
        const custDoc = await Customer.findById(newCustomerId);
        if (!custDoc) {
            throw new Error("Customer not found");
        }

        // Apply set-off to new Customer
        setOffResult = await autoSetOffInvoices(newCustomerId, txAmount, {
            ...options,
            bankTransactionId: bankTx ? bankTx._id : undefined,
            existingBankLedgerEntryId: primaryEntry ? primaryEntry._id : undefined,
            primaryLedgerEntry: primaryEntry ? primaryEntry._id : undefined,
            entryDate: options.entryDate || (primaryEntry ? primaryEntry.entryDate : new Date()),
            transactionId: (bankTx && bankTx.transactionId) || (primaryEntry && primaryEntry.transactionId) || String(transactionId),
            createdBy: options.createdBy,
            creatorRole: options.creatorRole
        });

        // Update contact & names
        if (bankTx) {
            bankTx.customer = newCustomerId;
            bankTx.customerName = custDoc.name;
            bankTx.supplier = undefined;
            bankTx.supplierName = undefined;
            await bankTx.save();
        }
        if (primaryEntry) {
            primaryEntry.contact = newCustomerId;
            primaryEntry.supplier = undefined;
            await primaryEntry.save();
        }
    } else {
        // Unlink contact
        if (bankTx) {
            bankTx.customer = undefined;
            bankTx.customerName = undefined;
            bankTx.supplier = undefined;
            bankTx.supplierName = undefined;
            bankTx.invoices = [];
            bankTx.bills = [];
            bankTx.setOffSummary = undefined;
            await bankTx.save();
        }
        if (primaryEntry) {
            primaryEntry.contact = undefined;
            primaryEntry.supplier = undefined;
            primaryEntry.invoices = [];
            primaryEntry.bills = [];
            primaryEntry.setOffSummary = undefined;
            await primaryEntry.save();
        }
    }

    // Recalculate running balances
    if (bankTx && bankTx.bankAccount) {
        await recalculateRunningBalances(bankTx.bankAccount);
    } else if (primaryEntry && primaryEntry.bankAccount) {
        await recalculateRunningBalances(primaryEntry.bankAccount);
    }

    return {
        success: true,
        transactionId,
        newCustomerId,
        setOffResult
    };
};

/**
 * Dedicated Service 3: Update Vendor Transaction Amount
 */
const updateVendorTransactionAmount = async (transactionId, newAmount, options = {}) => {
    const numAmount = Number(newAmount);
    if (isNaN(numAmount) || numAmount <= 0) {
        throw new Error("Amount must be a positive number");
    }

    const BankTransaction = require("../Model/BankTransactionModel");
    const LedgerEntry = require("../../Ledger/Model/LedgerEntryModel");
    const InvoiceBillSetOffHistory = require("../Model/InvoiceBillSetOffHistoryModel");

    let bankTx = null;
    let primaryEntry = null;
    const txStringId = String(transactionId);

    if (mongoose.Types.ObjectId.isValid(transactionId)) {
        bankTx = await BankTransaction.findById(transactionId);
        if (bankTx && bankTx.ledgerEntry) {
            primaryEntry = await LedgerEntry.findById(bankTx.ledgerEntry);
        } else if (!bankTx) {
            primaryEntry = await LedgerEntry.findById(transactionId);
        }
    }
    if (!primaryEntry && bankTx && bankTx.ledgerEntry) {
        primaryEntry = await LedgerEntry.findById(bankTx.ledgerEntry);
    }
    if (!primaryEntry && !bankTx) {
        primaryEntry = await LedgerEntry.findOne({ transactionId: txStringId });
    }
    if (!bankTx && primaryEntry) {
        bankTx = await BankTransaction.findOne({
            $or: [
                { ledgerEntry: primaryEntry._id },
                { transactionId: primaryEntry.transactionId }
            ]
        });
    }

    const searchConditions = [];
    if (mongoose.Types.ObjectId.isValid(transactionId)) {
        searchConditions.push({ _id: transactionId });
        searchConditions.push({ primaryLedgerEntry: transactionId });
        searchConditions.push({ partnerLedgerEntries: transactionId });
        searchConditions.push({ bankTransaction: transactionId });
    }
    if (primaryEntry) {
        searchConditions.push({ primaryLedgerEntry: primaryEntry._id });
        searchConditions.push({ partnerLedgerEntries: primaryEntry._id });
    }
    if (bankTx) {
        searchConditions.push({ bankTransaction: bankTx._id });
        if (bankTx.ledgerEntry) searchConditions.push({ primaryLedgerEntry: bankTx.ledgerEntry });
    }
    if (txStringId) searchConditions.push({ transactionId: txStringId });

    const history = await InvoiceBillSetOffHistory.findOne({ $or: searchConditions });

    const targetSupplierId = (history && history.supplier)
        || (bankTx && bankTx.supplier)
        || (primaryEntry && primaryEntry.supplier);

    if (!targetSupplierId) {
        throw new Error("No Vendor/Supplier associated with this transaction");
    }

    // 1. Reverse existing set-off cleanly
    await reverseSetOffFromHistory(primaryEntry ? primaryEntry._id : (bankTx ? bankTx._id : transactionId));

    // 2. Update BankTransaction & LedgerEntry amounts
    if (primaryEntry) {
        primaryEntry.amount = numAmount;
        await primaryEntry.save();
    }
    if (bankTx) {
        bankTx.amount = numAmount;
        await bankTx.save();
    }

    // 3. Re-run autoSetOffBills for Supplier with new amount
    const resolvedTxId = (bankTx && bankTx.transactionId) || (primaryEntry && primaryEntry.transactionId) || txStringId;
    const setOffResult = await autoSetOffBills(targetSupplierId, numAmount, {
        ...options,
        bankTransactionId: bankTx ? bankTx._id : undefined,
        existingBankLedgerEntryId: primaryEntry ? primaryEntry._id : undefined,
        primaryLedgerEntry: primaryEntry ? primaryEntry._id : undefined,
        entryDate: options.entryDate || (primaryEntry ? primaryEntry.entryDate : (bankTx ? bankTx.entryDate : new Date())),
        transactionId: resolvedTxId,
        createdBy: options.createdBy,
        creatorRole: options.creatorRole
    });

    // 4. Recalculate running balances
    const bankAccountId = (bankTx && bankTx.bankAccount) || (primaryEntry && primaryEntry.bankAccount);
    if (bankAccountId) {
        await recalculateRunningBalances(bankAccountId);
    }

    return {
        success: true,
        transactionId,
        newAmount: numAmount,
        supplierId: targetSupplierId,
        setOffResult
    };
};

/**
 * Dedicated Service 4: Update Vendor Contact
 */
const updateVendorContact = async (transactionId, newSupplierId, options = {}) => {
    const BankTransaction = require("../Model/BankTransactionModel");
    const LedgerEntry = require("../../Ledger/Model/LedgerEntryModel");
    const Supplier = require("../../Supplier/Model/SupplierModel");

    let bankTx = null;
    let primaryEntry = null;

    if (mongoose.Types.ObjectId.isValid(transactionId)) {
        bankTx = await BankTransaction.findById(transactionId);
        if (bankTx && bankTx.ledgerEntry) {
            primaryEntry = await LedgerEntry.findById(bankTx.ledgerEntry);
        } else if (!bankTx) {
            primaryEntry = await LedgerEntry.findById(transactionId);
        }
    }
    if (!primaryEntry && bankTx && bankTx.ledgerEntry) {
        primaryEntry = await LedgerEntry.findById(bankTx.ledgerEntry);
    }
    if (!primaryEntry && !bankTx) {
        primaryEntry = await LedgerEntry.findOne({ transactionId: String(transactionId) });
    }
    if (!bankTx && primaryEntry) {
        bankTx = await BankTransaction.findOne({
            $or: [
                { ledgerEntry: primaryEntry._id },
                { transactionId: primaryEntry.transactionId }
            ]
        });
    }

    if (!primaryEntry && !bankTx) {
        throw new Error("Transaction not found");
    }

    // 1. Reverse existing set-off (Vendor or Customer)
    await reverseSetOffFromHistory(transactionId);

    const txAmount = bankTx ? bankTx.amount : (primaryEntry ? primaryEntry.amount : 0);

    let setOffResult = null;
    if (newSupplierId) {
        const supDoc = await Supplier.findById(newSupplierId);
        if (!supDoc) {
            throw new Error("Supplier not found");
        }

        // Apply set-off to new Supplier
        setOffResult = await autoSetOffBills(newSupplierId, txAmount, {
            ...options,
            bankTransactionId: bankTx ? bankTx._id : undefined,
            existingBankLedgerEntryId: primaryEntry ? primaryEntry._id : undefined,
            primaryLedgerEntry: primaryEntry ? primaryEntry._id : undefined,
            entryDate: options.entryDate || (primaryEntry ? primaryEntry.entryDate : new Date()),
            transactionId: (bankTx && bankTx.transactionId) || (primaryEntry && primaryEntry.transactionId) || String(transactionId),
            createdBy: options.createdBy,
            creatorRole: options.creatorRole
        });

        // Update supplier & names
        if (bankTx) {
            bankTx.supplier = newSupplierId;
            bankTx.supplierName = supDoc.name || supDoc.companyName;
            bankTx.customer = undefined;
            bankTx.customerName = undefined;
            await bankTx.save();
        }
        if (primaryEntry) {
            primaryEntry.supplier = newSupplierId;
            primaryEntry.contact = undefined;
            await primaryEntry.save();
        }
    } else {
        // Unlink contact
        if (bankTx) {
            bankTx.supplier = undefined;
            bankTx.supplierName = undefined;
            bankTx.customer = undefined;
            bankTx.customerName = undefined;
            bankTx.invoices = [];
            bankTx.bills = [];
            bankTx.setOffSummary = undefined;
            await bankTx.save();
        }
        if (primaryEntry) {
            primaryEntry.supplier = undefined;
            primaryEntry.contact = undefined;
            primaryEntry.invoices = [];
            primaryEntry.bills = [];
            primaryEntry.setOffSummary = undefined;
            await primaryEntry.save();
        }
    }

    // Recalculate running balances
    if (bankTx && bankTx.bankAccount) {
        await recalculateRunningBalances(bankTx.bankAccount);
    } else if (primaryEntry && primaryEntry.bankAccount) {
        await recalculateRunningBalances(primaryEntry.bankAccount);
    }

    return {
        success: true,
        transactionId,
        newSupplierId,
        setOffResult
    };
};

module.exports = {
    createBankAccount,
    getAllBankAccounts,
    getBankAccountById,
    updateBankAccount,
    deleteBankAccount,
    updateBalance,
    importStatement,
    recordManualPayment,
    deleteAllTransactions,
    recalculateRunningBalances,
    bulkDeleteTransactions,
    bulkEditTransactions,
    ensureSubAccountingCode,
    syncAccountingCodeBalances,
    autoSetOffInvoices,
    autoSetOffBills,
    reverseSetOffFromHistory,
    updateCustomerTransactionAmount,
    updateCustomerContact,
    updateVendorTransactionAmount,
    updateVendorContact
};
