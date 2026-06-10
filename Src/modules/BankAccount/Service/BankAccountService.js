const BankAccount = require("../Model/BankAccountModel");
const AccountingCode = require("../../AccountingCode/Model/AccountingCodeModel");
const AppError = require("../../../shared/utils/AppError");

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
    const updatedData = await Promise.all(result.data.map(async (account) => {
        const accObject = account.toObject ? account.toObject() : account;
        const codeId = account.accountingCode 
            ? (account.accountingCode._id || account.accountingCode)
            : null;
            
        if (codeId) {
            const count = await LedgerEntry.countDocuments({
                accountingCode: codeId
            });
            accObject.transactionCount = count;
        } else {
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
        const count = await LedgerEntry.countDocuments({
            accountingCode: codeId
        });
        accObject.transactionCount = count;
    } else {
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
    const accObject = account.toObject();
    const codeId = account.accountingCode 
        ? (account.accountingCode._id || account.accountingCode)
        : null;

    if (codeId) {
        const count = await LedgerEntry.countDocuments({
            accountingCode: codeId
        });
        accObject.transactionCount = count;
    } else {
        accObject.transactionCount = 0;
    }
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

module.exports = {
    createBankAccount,
    getAllBankAccounts,
    getBankAccountById,
    updateBankAccount,
    deleteBankAccount,
    updateBalance,
    importStatement
};
