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
    return await applyQueryFeatures(BankAccount, queryParams, queryOptions);
};

const getBankAccountById = async (id) => {
    const account = await BankAccount.findOne({ _id: id, isDeleted: false }).populate("accountingCode");
    if (!account) throw new AppError("Bank account not found", 404);
    return account;
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
    return account;
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

module.exports = {
    createBankAccount,
    getAllBankAccounts,
    getBankAccountById,
    updateBankAccount,
    deleteBankAccount,
    updateBalance
};
