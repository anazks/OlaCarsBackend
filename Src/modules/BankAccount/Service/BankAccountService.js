const mongoose = require("mongoose");
const BankAccount = require("../Model/BankAccountModel");
const AccountingCode = require("../../AccountingCode/Model/AccountingCodeModel");
const AppError = require("../../../shared/utils/AppError");

const escapeRegExp = (string) => {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

const ensureSubAccountingCode = async (parentAccountVal, accountsNameVal, creatorId, creatorRole) => {
    let parentName = String(parentAccountVal || "").trim();
    const subName = String(accountsNameVal || "").trim();

    // Intelligent parent mapping
    let parentDoc = null;

    if (parentName) {
        // 1. Try exact match on code or name (case-insensitive with regex escape)
        parentDoc = await AccountingCode.findOne({
            $or: [
                { code: parentName },
                { name: { $regex: new RegExp(`^${escapeRegExp(parentName)}$`, "i") } }
            ],
            isDeleted: false
        });

        // 2. Try partial match (substring) on parent accounts (no parentAccount field)
        if (!parentDoc) {
            parentDoc = await AccountingCode.findOne({
                name: { $regex: new RegExp(escapeRegExp(parentName), "i") },
                parentAccount: null,
                isDeleted: false
            });
        }

        // 3. Try key match
        if (!parentDoc) {
            const lowerParent = parentName.toLowerCase();
            let fallbackCode = null;
            if (lowerParent.includes("receivable") || lowerParent.includes("cobrar")) {
                fallbackCode = "1.1.03";
            } else if (lowerParent.includes("payable") || lowerParent.includes("pagar")) {
                fallbackCode = "2.1.01";
            } else if (lowerParent.includes("income") || lowerParent.includes("revenue") || lowerParent.includes("ingreso") || lowerParent.includes("venta")) {
                fallbackCode = "4.1.01";
            } else if (lowerParent.includes("expense") || lowerParent.includes("gasto")) {
                fallbackCode = "6.1.01";
            }

            if (fallbackCode) {
                parentDoc = await AccountingCode.findOne({
                    code: fallbackCode,
                    isDeleted: false
                });
            }
        }
    }

    // 4. Default fallbacks if parent still not found
    if (!parentDoc) {
        // Default to "Accounts Receivable/Cuenta por Cobrar" (code 1.1.03)
        parentDoc = await AccountingCode.findOne({
            code: "1.1.03",
            isDeleted: false
        });
    }

    if (!parentDoc) {
        // Fallback to first primary account
        parentDoc = await AccountingCode.findOne({
            parentAccount: null,
            isDeleted: false
        });
    }

    if (!parentDoc) {
        throw new AppError("Parent Account is required and could not be resolved in Chart of Accounts.", 400);
    }

    // Always return parent account directly; do not create sub-accounts for customers/names
    return parentDoc;

    // 5. Find existing sub-accounting code under this parent
    let subDoc = await AccountingCode.findOne({
        parentAccount: parentDoc._id,
        name: { $regex: new RegExp(`^${escapeRegExp(subName)}$`, "i") },
        isDeleted: false
    });

    if (!subDoc) {
        console.log(`[BankAccountService] Creating new sub-accounting code: ${subName}`);
        const subCount = await AccountingCode.countDocuments({ parentAccount: parentDoc._id });
        let suffix = subCount + 1;
        let uniqueCode = `${parentDoc.code}-${String(suffix).padStart(3, '0')}`;
        let exists = await AccountingCode.findOne({ code: uniqueCode });
        while (exists) {
            suffix++;
            uniqueCode = `${parentDoc.code}-${String(suffix).padStart(3, '0')}`;
            exists = await AccountingCode.findOne({ code: uniqueCode });
        }

        subDoc = await AccountingCode.create({
            code: uniqueCode,
            name: subName,
            parentAccount: parentDoc._id,
            category: parentDoc.category,
            accountType: parentDoc.accountType,
            description: `Auto-created sub-account for ${subName} under parent ${parentDoc.name}`,
            currency: parentDoc.currency || "USD",
            accountStatus: "Active",
            createdBy: creatorId,
            creatorRole: creatorRole || "ADMIN"
        });
    }

    return subDoc;
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

    // For each bank account, attach the transaction count
    const LedgerEntry = require("../../Ledger/Model/LedgerEntryModel");
    const BankTransaction = require("../Model/BankTransactionModel");
    const updatedData = await Promise.all(result.data.map(async (account) => {
        const accObject = account.toObject ? account.toObject() : account;
        const codeId = account.accountingCode
            ? (account.accountingCode._id || account.accountingCode)
            : null;

        const ledgerCount = codeId ? await LedgerEntry.countDocuments({ accountingCode: codeId }) : 0;
        const bankTxCount = await BankTransaction.countDocuments({ bankAccount: account._id });
        accObject.transactionCount = ledgerCount + bankTxCount;
        return accObject;
    }));

    result.data = updatedData;
    return result;
};

const getBankAccountById = async (id) => {
    const account = await BankAccount.findOne({ _id: id, isDeleted: false }).populate("accountingCode");
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

        const journalPayload = {
            description: description || `Bank Statement Transaction - Ref: ${referenceNumber || 'N/A'}`,
            date: date ? new Date(date) : new Date(),
            branch: branchId,
            lines: [
                {
                    accountingCode: account.accountingCode,
                    type,
                    amount: numericAmount,
                    description: `${description || 'Bank transaction'}${payee ? ` - Payee: ${payee}` : ''}${referenceNumber ? ` - Ref: ${referenceNumber}` : ''}`
                },
                {
                    accountingCode: arCodeDoc ? arCodeDoc._id : account.accountingCode,
                    type: type === "DEBIT" ? "CREDIT" : "DEBIT",
                    amount: numericAmount,
                    description: `${description || 'Bank transaction offset'}${payee ? ` - Payee: ${payee}` : ''}${referenceNumber ? ` - Ref: ${referenceNumber}` : ''}`
                }
            ],
            createdBy: userId,
            creatorRole: finalRole
        };

        await ManualJournalService.createManualJournal(journalPayload);

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
        branchId,
        supportingDocument,
        userId,
        userRole,
        customerId,
        invoiceId
    } = data;

    const targetAccount = await BankAccount.findOne({ _id: targetId, isDeleted: false });
    if (!targetAccount) throw new AppError("Target bank account not found", 404);

    const fromAccount = await BankAccount.findOne({ _id: fromAccountId, isDeleted: false });
    if (!fromAccount) throw new AppError("Source bank account (From Account) not found", 404);

    if (!targetAccount.accountingCode) {
        throw new AppError("Target bank account is not linked to any accounting code", 400);
    }
    if (!fromAccount.accountingCode) {
        throw new AppError("Source bank account is not linked to any accounting code", 400);
    }

    const numericAmount = Number(amount);
    if (isNaN(numericAmount) || numericAmount <= 0) {
        throw new AppError("Amount must be a positive number", 400);
    }

    const ManualJournalService = require("../../Ledger/Service/ManualJournalService");

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

    // Resolve credit accounting code and load invoice if provided
    let creditAccountingCode = fromAccount.accountingCode;
    let invoiceDoc = null;

    if (invoiceId) {
        const { Invoice } = require("../../Invoice/Model/InvoiceModel");
        invoiceDoc = await Invoice.findOne({ _id: invoiceId, isDeleted: false });
        if (invoiceDoc) {
            const arAccount = await AccountingCode.findOne({ code: "1.1.03" })
                || await AccountingCode.findOne({ code: "1100" })
                || await AccountingCode.findOne({ code: "1200" });
            if (arAccount) {
                creditAccountingCode = arAccount._id;
            }
        }
    }

    const journalPayload = {
        description: description || `Manual Payment via ${paymentMode}`,
        date: (() => {
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
        })(),
        branch: finalBranchId,
        paymentMode,
        currency: currency || "USD",
        fromAccount: fromAccountId,
        supportingDocument,
        lines: [
            {
                accountingCode: targetAccount.accountingCode,
                type: "DEBIT",
                amount: numericAmount,
                description: description || `Manual Payment Received - Mode: ${paymentMode}${invoiceDoc ? ` (INV: ${invoiceDoc.invoiceNumber})` : ''}`,
                contact: customerId || undefined
            },
            {
                accountingCode: creditAccountingCode,
                type: "CREDIT",
                amount: numericAmount,
                description: description || `Manual Payment Sent - Mode: ${paymentMode}${invoiceDoc ? ` (INV: ${invoiceDoc.invoiceNumber})` : ''}`,
                contact: customerId || undefined
            }
        ],
        createdBy: userId,
        creatorRole: finalRole
    };

    const result = await ManualJournalService.createManualJournal(journalPayload);

    // Apply the payment to the Invoice if one is selected
    if (invoiceDoc && invoiceDoc.status !== "PAID") {
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

        // Sync with Service Bill if it's workshop
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

        // Run sync, excess application and rollover calculations
        try {
            const InvoiceService = require("../../Invoice/Service/InvoiceService");
            await InvoiceService.syncInvoiceToAdditionalPayments(invoiceDoc);
            await InvoiceService.rolloverCustomerInvoices(invoiceDoc.customer);

            // Handle excess if any
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

    // Update target balance (DEBIT: increases Asset balance, decreases Liability balance)
    let targetBalanceChange = 0;
    if (targetAccount.accountType === "Credit Card") {
        targetBalanceChange = -numericAmount;
    } else {
        targetBalanceChange = numericAmount;
    }
    targetAccount.currentBalance = Number(targetAccount.currentBalance || 0) + targetBalanceChange;
    await targetAccount.save();

    // Update from balance (CREDIT: decreases Asset balance, increases Liability balance)
    let fromBalanceChange = 0;
    if (fromAccount.accountType === "Credit Card") {
        fromBalanceChange = numericAmount;
    } else {
        fromBalanceChange = -numericAmount;
    }
    fromAccount.currentBalance = Number(fromAccount.currentBalance || 0) + fromBalanceChange;
    await fromAccount.save();

    return {
        success: true,
        journal: result.journal,
        targetNewBalance: targetAccount.currentBalance,
        fromNewBalance: fromAccount.currentBalance
    };
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

    const LedgerEntry = require("../../Ledger/Model/LedgerEntryModel");
    const ManualJournal = require("../../Ledger/Model/ManualJournalModel");

    // Find all ledger entries for this account's accounting code
    const entries = await LedgerEntry.find({ accountingCode: account.accountingCode });

    // Collect unique manualJournal IDs from those entries
    const journalIds = [...new Set(
        entries
            .filter(e => e.manualJournal)
            .map(e => e.manualJournal.toString())
    )];

    // Delete all ledger entries that reference these journals
    // (covers the double-entry partner lines too)
    let deletedEntries = 0;
    if (journalIds.length > 0) {
        const result = await LedgerEntry.deleteMany({ manualJournal: { $in: journalIds } });
        deletedEntries = result.deletedCount;

        // Delete the ManualJournal header documents
        await ManualJournal.deleteMany({ _id: { $in: journalIds } });
    }

    // Also remove any orphaned entries directly on this accounting code (no journal)
    const orphanResult = await LedgerEntry.deleteMany({
        accountingCode: account.accountingCode,
        manualJournal: { $exists: false }
    });
    deletedEntries += orphanResult.deletedCount;

    // Reset the balance back to the initial balance
    const previousBalance = account.currentBalance;
    account.currentBalance = account.initialBalance || 0;
    await account.save();

    return {
        deletedJournals: journalIds.length,
        deletedEntries,
        previousBalance,
        newBalance: account.currentBalance
    };
};

const recalculateRunningBalances = async (bankAccountId) => {
    const BankAccount = require("../Model/BankAccountModel");
    const LedgerEntry = require("../../Ledger/Model/LedgerEntryModel");

    const account = await BankAccount.findOne({ _id: bankAccountId, isDeleted: false });
    if (!account) return;

    const entries = await LedgerEntry.find({ accountingCode: account.accountingCode }).sort({ entryDate: 1, _id: 1 });

    let balanceAccum = account.initialBalance || 0;
    const bulkOps = [];
    const isCreditCard = account.accountType === 'Credit Card';

    for (const entry of entries) {
        if (entry.type === 'DEBIT') {
            balanceAccum = isCreditCard ? (balanceAccum - entry.amount) : (balanceAccum + entry.amount);
        } else if (entry.type === 'CREDIT') {
            balanceAccum = isCreditCard ? (balanceAccum + entry.amount) : (balanceAccum - entry.amount);
        }

        bulkOps.push({
            updateOne: {
                filter: { _id: entry._id },
                update: { $set: { runningBalance: balanceAccum } }
            }
        });
    }

    if (bulkOps.length > 0) {
        await LedgerEntry.bulkWrite(bulkOps);
    }

    account.currentBalance = balanceAccum;
    await account.save();

    return balanceAccum;
};

const bulkDeleteTransactions = async (bankAccountId, transactionIds) => {
    const BankAccount = require("../Model/BankAccountModel");
    const LedgerEntry = require("../../Ledger/Model/LedgerEntryModel");
    const ManualJournal = require("../../Ledger/Model/ManualJournalModel");

    const account = await BankAccount.findOne({ _id: bankAccountId, isDeleted: false });
    if (!account) throw new AppError("Bank account not found", 404);

    const entries = await LedgerEntry.find({ _id: { $in: transactionIds } });

    const journalIds = [...new Set(
        entries
            .filter(e => e.manualJournal)
            .map(e => e.manualJournal.toString())
    )];

    let deletedCount = 0;
    if (journalIds.length > 0) {
        const delEntries = await LedgerEntry.deleteMany({ manualJournal: { $in: journalIds } });
        deletedCount += delEntries.deletedCount;
        await ManualJournal.deleteMany({ _id: { $in: journalIds } });
    }

    const remainingIds = transactionIds.filter(id => !entries.find(e => e._id.toString() === id && e.manualJournal));
    if (remainingIds.length > 0) {
        const delOrphans = await LedgerEntry.deleteMany({ _id: { $in: remainingIds } });
        deletedCount += delOrphans.deletedCount;
    }

    await recalculateRunningBalances(bankAccountId);

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

        // 2. Swapping Offsetting Accounts (accountingCode)
        if (accountingCode !== undefined) {
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
            // Create a missing BankTransaction dynamically to enable linking and tracking
            bankTx = new BankTransaction({
                bankAccount: bankAccountId,
                branch: entry.branch,
                type: oldType,
                amount: oldAmount,
                description: entry.description || '',
                entryDate: oldEntryDate,
                transactionId: entry.transactionId || `TX-${Date.now()}-${Math.floor(Math.random() * 1000000)}`,
                accountingCode: entry.accountingCode,
                createdBy: entry.createdBy,
                creatorRole: entry.creatorRole
            });
            await bankTx.save();
            console.log(`[bulkEditTransactions] Created dynamically missing BankTransaction ${bankTx._id} for LedgerEntry ${entry._id}`);
        }

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
                : (bankTx.customer || entry.contact || (partner && partner.contact));
            const newCustomerId = (typeof customer === 'object' && customer !== null) ? (customer._id || customer.id) : customer;

            const finalAmount = amount !== undefined ? Number(amount) : oldAmount;
            const finalEntryDate = entryDate !== undefined ? new Date(entryDate) : oldEntryDate;

            // Automatically sync invoice number in description
            const invoiceRegex = /((?:INV|MAN|WRK)-\w+(?:-\w+)*)/i;
            let finalDesc = description !== undefined ? description : entry.description;

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

            // Check if Customer or Invoice is switched / changed or unlinked
            const isCustomerChanged = String(oldCustomerId || '') !== String(newCustomerId || '');
            const isInvoiceChanged = String(oldInvoiceId || '') !== String(newInvoiceId || '');
            const hasExistingSetOff = (bankTx.invoices && bankTx.invoices.length > 0) || oldInvoiceId || oldCustomerId;

            if (hasExistingSetOff && (isCustomerChanged || isInvoiceChanged || !newCustomerId)) {
                console.log(`[bulkEditTransactions] Reversing previous customer set-off / invoice linking for transaction ${bankTx._id}, oldCustomer=${oldCustomerId}`);

                const PaymentReceived = require("../../PaymentReceived/Model/PaymentReceivedModel");

                // 1. Find all PaymentReceived documents associated with this bankTx or oldCustomerId & entry
                const searchConditions = [];
                if (bankTx.transactionId) {
                    searchConditions.push({ referenceNumber: bankTx.transactionId });
                    searchConditions.push({ notes: { $regex: new RegExp(escapeRegExp(bankTx.transactionId), "i") } });
                }
                if (entry._id) {
                    searchConditions.push({ notes: { $regex: new RegExp(escapeRegExp(entry._id.toString()), "i") } });
                }
                if (bankTx._id) {
                    searchConditions.push({ notes: { $regex: new RegExp(escapeRegExp(bankTx._id.toString()), "i") } });
                }
                if (oldCustomerId) {
                    searchConditions.push({ customerId: oldCustomerId, amountReceived: oldAmount });
                }

                const prDocs = searchConditions.length > 0
                    ? await PaymentReceived.find({ $or: searchConditions })
                    : [];

                const prNumbers = prDocs.map(p => p.paymentNumber).filter(Boolean);
                const prIds = prDocs.map(p => p._id.toString());

                // 2. Collect all invoice IDs to revert
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

                // Also check if any invoice of oldCustomerId has matching payment records for this transaction
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

                // 3. Revert payment amounts & statuses on previous invoices
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
                        if (newBalance <= 0) {
                            newStatus = "PAID";
                        } else if (newPaid > 0) {
                            newStatus = "PARTIAL";
                        } else {
                            const now = new Date();
                            if (invDoc.dueDate && new Date(invDoc.dueDate) < now) {
                                newStatus = "OVERDUE";
                            } else {
                                newStatus = "PENDING";
                            }
                        }

                        invDoc.amountPaid = newPaid;
                        invDoc.balance = newBalance;
                        invDoc.status = newStatus;
                        if (newStatus !== "PAID") {
                            invDoc.paidAt = undefined;
                        }
                        await invDoc.save();

                        // Sync ServiceBill if workshop invoice
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

                // 4. Remove previous PaymentReceived records
                if (prIds.length > 0) {
                    await PaymentReceived.deleteMany({ _id: { $in: prIds } });
                    console.log(`[bulkEditTransactions] Deleted ${prIds.length} PaymentReceived record(s) for customer ${oldCustomerId}`);
                }

                // 5. Remove previous double-entry ledger impact and ManualJournals
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

                    // Resync Accounts Receivable & Advance Received accounting code balances after deleting old journal
                    const AccountingCode = require("../../AccountingCode/Model/AccountingCodeModel");
                    const arCode = await AccountingCode.findOne({ $or: [{ code: "1.1.03" }, { name: { $regex: /Accounts Receivable|Cuenta por Cobrar/i } }], isDeleted: { $ne: true } });
                    const advCode = await AccountingCode.findOne({ $or: [{ code: "2.1.02" }, { name: { $regex: /Advance Received|Anticipo/i } }], isDeleted: { $ne: true } });
                    if (arCode) await syncAccountingCodeBalances(arCode._id);
                    if (advCode) await syncAccountingCodeBalances(advCode._id);
                } catch (mjErr) {
                    console.error("[bulkEditTransactions] Error deleting old ledger journal:", mjErr);
                }

                // Clear bankTx invoice/setOff metadata
                bankTx.invoices = [];
                bankTx.invoice = undefined;
                bankTx.setOffSummary = undefined;

                // Strip unlinked invoice numbers from entry and bankTx descriptions & delete set-off ledger entries matching unlinked invoices
                const prevInvoiceDocs = await Invoice.find({ _id: { $in: Array.from(prevInvoiceIds) } });
                const prevInvoiceNumbers = prevInvoiceDocs.map(i => i.invoiceNumber).filter(Boolean);
                for (const invNum of prevInvoiceNumbers) {
                    await LedgerEntry.deleteMany({
                        description: { $regex: new RegExp(escapeRegExp(invNum), "i") },
                        _id: { $ne: entry._id }
                    });
                    const invRegex = new RegExp(`(?:\\s*\\|?\\s*-?\\s*Set off:\\s*${escapeRegExp(invNum)}|\\s*\\|?\\s*-?\\s*${escapeRegExp(invNum)})`, 'gi');
                    finalDesc = (finalDesc || '').replace(invRegex, '').trim();
                    entry.description = (entry.description || '').replace(invRegex, '').trim();
                    if (bankTx) {
                        bankTx.description = (bankTx.description || '').replace(invRegex, '').trim();
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

            // Perform automatic set-off if a customer is selected and it's a DEBIT (incoming funds)
            if (newCustomerId && (type || oldType) === "DEBIT") {
                const BankAccount = require("../Model/BankAccountModel");
                const bankAccountDoc = await BankAccount.findById(bankAccountId);
                const bankAccCodeId = bankAccountDoc ? bankAccountDoc.accountingCode : entry.accountingCode;

                const setOffResult = await autoSetOffInvoices(newCustomerId, finalAmount, {
                    bankAccountingCodeId: bankAccCodeId,
                    branchId: entry.branch,
                    entryDate: finalEntryDate,
                    description: finalDesc || `Bank statement edit set-off`,
                    transactionId: bankTx.transactionId || entry.transactionId,
                    existingBankLedgerEntryId: entry._id,
                    createdBy: entry.createdBy || bankTx.createdBy || "6a2290019fa01283dd165204",
                    creatorRole: entry.creatorRole || bankTx.creatorRole || "ADMIN"
                });

                bankTx.customer = newCustomerId;
                bankTx.customerName = newCustomerDoc ? (newCustomerDoc.name || newCustomerDoc.customerName) : undefined;
                bankTx.invoices = setOffResult.invoicesSetOff.map(inv => ({
                    invoiceId: inv.invoiceId,
                    invoiceNumber: inv.invoiceNumber,
                    amountApplied: inv.amountApplied
                }));
                bankTx.setOffSummary = {
                    totalSetOff: setOffResult.totalSetOff,
                    invoiceCount: setOffResult.invoicesSetOff.length,
                    excessAmount: setOffResult.excessAmount
                };
                bankTx.invoice = setOffResult.invoicesSetOff.length > 0 ? setOffResult.invoicesSetOff[0].invoiceId : undefined;

                const invoiceNumbers = setOffResult.invoicesSetOff.map(inv => inv.invoiceNumber).join(", ");
                const custName = newCustomerDoc ? (newCustomerDoc.name || newCustomerDoc.customerName) : '';
                if (setOffResult.invoicesSetOff.length > 0) {
                    finalDesc = `Bank deposit - Customer: ${custName} | ${invoiceNumbers}${bankTx.transactionId ? ` | Ref: ${bankTx.transactionId}` : ''}`;
                } else {
                    finalDesc = `Bank deposit - Customer: ${custName} | Advance Payment ($${setOffResult.excessAmount.toFixed(2)})${bankTx.transactionId ? ` | Ref: ${bankTx.transactionId}` : ''}`;
                }
            } else if (!newCustomerId) {
                // Customer unlinked
                bankTx.customer = undefined;
                bankTx.customerName = undefined;
                bankTx.invoice = undefined;
                bankTx.invoices = [];
                bankTx.setOffSummary = undefined;
                finalDesc = `Bank statement deposit${bankTx.transactionId ? ` | Ref: ${bankTx.transactionId}` : ''}`;
            }

            // Sync contact (customer) field and description on the LedgerEntries
            entry.contact = newCustomerId || undefined;
            entry.description = finalDesc;
            if (amount !== undefined) entry.amount = finalAmount;
            if (entryDate !== undefined) entry.entryDate = finalEntryDate;
            await entry.save();

            if (partner) {
                partner.contact = newCustomerId || undefined;
                partner.description = finalDesc;
                if (amount !== undefined) partner.amount = finalAmount;
                if (entryDate !== undefined) partner.entryDate = finalEntryDate;
                await partner.save();
            }

            // Update BankTransaction fields
            bankTx.description = finalDesc;
            if (entryDate !== undefined) bankTx.entryDate = finalEntryDate;
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
                if (description !== undefined) journal.description = description;
                if (amount !== undefined) journal.totalAmount = Number(amount);
                await journal.save();

                const partnerUpdate = {};
                if (entryDate !== undefined) partnerUpdate.entryDate = new Date(entryDate);
                if (amount !== undefined) partnerUpdate.amount = Number(amount);
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
            }
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
        isDeleted: { $ne: true }
    });

    console.log(`[AUTO SET-OFF STAGE 1] DB Query result for customer "${customerName}": Found ${unpaidInvoices.length} unpaid invoice(s).`);
    unpaidInvoices.forEach((inv, i) => {
        const invBal = inv.balance !== undefined ? inv.balance : (inv.totalAmountDue - (inv.amountPaid || 0));
        console.log(`  📌 [${i + 1}] Invoice #${inv.invoiceNumber} | ID: ${inv._id} | Status: ${inv.status} | Total Due: $${inv.totalAmountDue} | Paid: $${inv.amountPaid || 0} | Balance: $${invBal} | Due Date: ${inv.dueDate ? new Date(inv.dueDate).toISOString().split('T')[0] : 'N/A'}`);
    });

    const partialInvoices = unpaidInvoices
        .filter(inv => String(inv.status).toUpperCase() === "PARTIAL")
        .sort((a, b) => new Date(a.dueDate || 0) - new Date(b.dueDate || 0));

    const otherInvoices = unpaidInvoices
        .filter(inv => String(inv.status).toUpperCase() !== "PARTIAL")
        .sort((a, b) => new Date(a.dueDate || 0) - new Date(b.dueDate || 0));

    const sortedInvoices = [...partialInvoices, ...otherInvoices];

    console.log(`[AUTO SET-OFF STAGE 2] Priority Order for Set-off (${sortedInvoices.length} invoice(s)):`);
    sortedInvoices.forEach((inv, idx) => {
        console.log(`  ${idx + 1}. #${inv.invoiceNumber} (${inv.status}) - Due Date: ${inv.dueDate ? new Date(inv.dueDate).toISOString().split('T')[0] : 'N/A'}`);
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

    const timestamp = entryDate instanceof Date ? entryDate : new Date(entryDate);

    for (const invoice of sortedInvoices) {
        if (remainingAmount <= 0.01) break;

        const invoiceBalance = invoice.balance !== undefined ? invoice.balance : (invoice.totalAmountDue - (invoice.amountPaid || 0));
        if (invoiceBalance <= 0) continue;

        const amountToApply = Math.min(remainingAmount, invoiceBalance);
        const newPaid = (invoice.amountPaid || 0) + amountToApply;
        const newBalance = Math.max(0, invoice.totalAmountDue - newPaid);
        let newStatus = "PENDING";
        if (newBalance <= 0) newStatus = "PAID";
        else if (newPaid > 0) newStatus = "PARTIAL";

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
            newStatus,
            newBalance
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

    if (bankAccountingCodeId && (targetArCode || targetAdvCode)) {
        try {
            const invoiceNumbers = invoicesSetOff.length > 0
                ? invoicesSetOff.map(inv => inv.invoiceNumber).join(", ")
                : "No open invoices";
            const prNumber = prDoc ? prDoc.paymentNumber : "PR-Pending";

            const journalLines = [];

            // If existingBankLedgerEntryId is provided, don't create a new DEBIT line; update existing entry instead
            if (!options.existingBankLedgerEntryId) {
                journalLines.push({
                    accountingCode: bankAccountingCodeId,
                    type: "DEBIT",
                    amount: amount,
                    description: `Bank deposit - Customer: ${customerName} | ${invoicesSetOff.length > 0 ? invoiceNumbers : 'Advance Payment'}${transactionId ? ` | Ref: ${transactionId}` : ''}`,
                    contact: customerId,
                    contactModel: "Customer",
                    transactionId: transactionId
                });
            }

            // Leg 2: CREDIT Accounts Receivable (for invoice set-off portion)
            if (totalSetOff > 0 && targetArCode) {
                journalLines.push({
                    accountingCode: targetArCode._id,
                    type: "CREDIT",
                    amount: totalSetOff,
                    description: `Invoice set-off payment (${invoiceNumbers}) - Customer: ${customerName}`,
                    contact: customerId,
                    contactModel: "Customer",
                    transactionId: transactionId
                });
            }

            // Leg 3: CREDIT Advance Received From Customer (2.1.02) for excess amount
            if (excessAmount > 0 && targetAdvCode) {
                journalLines.push({
                    accountingCode: targetAdvCode._id,
                    type: "CREDIT",
                    amount: excessAmount,
                    description: `Advance Received from Customer: ${customerName} | Payment Ref: ${prNumber} | Advance Amount: $${excessAmount.toFixed(2)}${transactionId ? ` | Bank Ref: ${transactionId}` : ''}`,
                    contact: customerId,
                    contactModel: "Customer",
                    transactionId: transactionId
                });
            }

            const journalPayload = {
                description: description || `Payment received - Customer: ${customerName} | ${invoicesSetOff.length > 0 ? 'Auto set-off (' + invoiceNumbers + ')' : 'Advance Payment (' + prNumber + ')'}`,
                date: timestamp,
                branch: branchId,
                lines: journalLines,
                createdBy: createdBy || "6a2290019fa01283dd165204",
                creatorRole: (creatorRole || "ADMIN").toUpperCase()
            };

            const mjResult = await ManualJournalService.createManualJournal(journalPayload);

            if (options.existingBankLedgerEntryId && mjResult && mjResult.journal) {
                const LedgerEntry = require("../../Ledger/Model/LedgerEntryModel");
                const existingEntry = await LedgerEntry.findById(options.existingBankLedgerEntryId);
                if (existingEntry) {
                    existingEntry.manualJournal = mjResult.journal._id;
                    existingEntry.contact = customerId;
                    existingEntry.contactModel = "Customer";
                    existingEntry.description = `Bank deposit - Customer: ${customerName} | ${invoicesSetOff.length > 0 ? invoiceNumbers : 'Advance Payment'}${transactionId ? ` | Ref: ${transactionId}` : ''}`;
                    await existingEntry.save();
                }
            }
            console.log(`[AUTO SET-OFF STAGE 6] Double-Entry Ledger Created successfully (Bank DR $${amount}, AR CR $${totalSetOff}, Advance 2.1.02 CR $${excessAmount})`);

            // Sync accounting code balances
            await syncAccountingCodeBalances(bankAccountingCodeId);
            if (targetArCode) await syncAccountingCodeBalances(targetArCode._id);
            if (targetAdvCode) await syncAccountingCodeBalances(targetAdvCode._id);
        } catch (ledgerErr) {
            console.error("[autoSetOffInvoices] Failed to create ledger entries:", ledgerErr);
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
        paymentReceived: prDoc ? { paymentNumber: prDoc.paymentNumber, _id: prDoc._id } : null
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
    autoSetOffInvoices
};
