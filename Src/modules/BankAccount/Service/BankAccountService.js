const mongoose = require("mongoose");
const BankAccount = require("../Model/BankAccountModel");
const AccountingCode = require("../../AccountingCode/Model/AccountingCodeModel");
const AppError = require("../../../shared/utils/AppError");

const ensureSubAccountingCode = async (parentAccountVal, accountsNameVal, creatorId, creatorRole) => {
    if (!accountsNameVal) return null;

    const parentName = String(parentAccountVal || "").trim();
    const subName = String(accountsNameVal || "").trim();

    if (!parentName) {
        throw new AppError("Parent Account is required when Accounts Name is specified", 400);
    }

    // 1. Find parent accounting code
    let parentDoc = await AccountingCode.findOne({
        $or: [
            { code: parentName },
            { name: { $regex: new RegExp(`^${parentName}$`, "i") } }
        ],
        isDeleted: false
    });

    if (!parentDoc) {
        throw new AppError(`Parent Account "${parentName}" not found in Chart of Accounts.`, 400);
    }

    // 2. Find existing sub-accounting code under this parent
    let subDoc = await AccountingCode.findOne({
        parentAccount: parentDoc._id,
        name: { $regex: new RegExp(`^${subName}$`, "i") },
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

    const account = await BankAccount.findOne({ _id: bankAccountId, isDeleted: false });
    if (!account) throw new AppError("Bank account not found", 404);

    const affectedBankAccounts = new Set([bankAccountId]);

    for (const update of updates) {
        const { id: txId, entryDate, description, type, amount, accountsName, parentAccount, bankName, bankAccountId: newBankAccountId } = update;
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
                    { bankName: { $regex: new RegExp(`^${trimmedBankName}$`, "i") } },
                    { accountName: { $regex: new RegExp(`^${trimmedBankName}$`, "i") } }
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

        // 2. Swapping/Auto-Creating Offsetting Accounts (ACCOUNTS NAME)
        if (accountsName && String(accountsName).trim()) {
            const subDoc = await ensureSubAccountingCode(
                parentAccount || "Accounts Receivable",
                accountsName,
                entry.createdBy,
                entry.creatorRole
            );

            if (subDoc) {
                if (entry.manualJournal) {
                    const journalLines = await LedgerEntry.find({ manualJournal: entry.manualJournal });
                    const partner = journalLines.find(l => l._id.toString() !== entry._id.toString());
                    if (partner) {
                        const oldSubAccId = partner.accountingCode;
                        partner.accountingCode = subDoc._id;
                        if (entryDate !== undefined) partner.entryDate = new Date(entryDate);
                        if (amount !== undefined) partner.amount = Number(amount);
                        if (type !== undefined) partner.type = type === "DEBIT" ? "CREDIT" : "DEBIT";
                        await partner.save();

                        if (oldSubAccId) {
                            await syncAccountingCodeBalances(oldSubAccId);
                        }
                        await syncAccountingCodeBalances(subDoc._id);
                    }
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
                        accountingCode: subDoc._id,
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

                    await syncAccountingCodeBalances(subDoc._id);
                }
            }
        }

        // Standard updates when there's an existing manualJournal and no accountsName swap
        if (entry.manualJournal && (!accountsName || !String(accountsName).trim())) {
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
    syncAccountingCodeBalances
};
