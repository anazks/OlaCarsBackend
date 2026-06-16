const BankAccountService = require("../Service/BankAccountService");

exports.createBankAccount = async (req, res, next) => {
    try {
        const data = {
            ...req.body,
            createdBy: req.user?._id,
            creatorRole: req.user?.role
        };
        const account = await BankAccountService.createBankAccount(data);
        res.status(201).json({
            success: true,
            data: account
        });
    } catch (error) {
        console.error("BankAccount creation error:", error);
        next(error);
    }
};

exports.getBankAccounts = async (req, res, next) => {
    try {
        const result = await BankAccountService.getAllBankAccounts(req.query);
        res.status(200).json({
            success: true,
            data: result.data,
            pagination: {
                total: result.total,
                page: result.page,
                limit: result.limit,
                totalPages: result.totalPages
            }
        });
    } catch (error) {
        next(error);
    }
};

exports.getBankAccount = async (req, res, next) => {
    try {
        const account = await BankAccountService.getBankAccountById(req.params.id);
        res.status(200).json({
            success: true,
            data: account
        });
    } catch (error) {
        next(error);
    }
};

exports.updateBankAccount = async (req, res, next) => {
    try {
        const data = {
            ...req.body,
            createdBy: req.user?._id,
            creatorRole: req.user?.role
        };
        const account = await BankAccountService.updateBankAccount(req.params.id, data);
        res.status(200).json({
            success: true,
            data: account
        });
    } catch (error) {
        next(error);
    }
};

exports.deleteBankAccount = async (req, res, next) => {
    try {
        await BankAccountService.deleteBankAccount(req.params.id);
        res.status(200).json({
            success: true,
            message: "Bank account deleted successfully"
        });
    } catch (error) {
        next(error);
    }
};

exports.deleteAllTransactions = async (req, res, next) => {
    try {
        const { id } = req.params;
        const BankAccount = require("../Model/BankAccountModel");
        const LedgerEntry = require("../../Ledger/Model/LedgerEntryModel");

        const account = await BankAccount.findOne({ _id: id, isDeleted: false });
        if (!account) {
            return res.status(404).json({ success: false, message: "Bank account not found" });
        }

        const accCodeId = account.accountingCode;
        if (!accCodeId) {
            return res.status(400).json({ success: false, message: "No accounting code linked to this bank account" });
        }

        // Delete all ledger entries matching this accountingCode
        const deleteResult = await LedgerEntry.deleteMany({ accountingCode: accCodeId });

        // Reset balance
        account.initialBalance = 0;
        account.currentBalance = 0;
        await account.save();

        res.status(200).json({
            success: true,
            message: `Deleted ${deleteResult.deletedCount} transaction entries. Balance reset to ${account.currentBalance}.`
        });
    } catch (error) {
        console.error("Error in deleteAllTransactions controller:", error);
        next(error);
    }
};

exports.importStatement = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { branchId, transactions } = req.body;

        if (!branchId) {
            return res.status(400).json({ success: false, message: "Branch ID is required" });
        }
        if (!transactions || !Array.isArray(transactions) || transactions.length === 0) {
            return res.status(400).json({ success: false, message: "Transactions array is required and cannot be empty" });
        }

        const result = await BankAccountService.importStatement(id, {
            branchId,
            transactions,
            userId: req.user?._id || req.user?.id,
            userRole: req.user?.role
        });

        res.status(200).json({
            success: true,
            message: `Successfully imported ${result.importedCount} transactions.`,
            data: result
        });
    } catch (error) {
        console.error("Bank statement import error:", error);
        next(error);
    }
};

exports.uploadBankStatement = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { branchId, transactions } = req.body;

        if (!transactions || !Array.isArray(transactions)) {
            return res.status(400).json({ success: false, message: "Invalid or empty transactions array" });
        }

        const BankAccount = require("../Model/BankAccountModel");
        const LedgerEntry = require("../../Ledger/Model/LedgerEntryModel");

        const account = await BankAccount.findOne({ _id: id, isDeleted: false });
        if (!account) {
            return res.status(404).json({ success: false, message: "Bank account not found" });
        }

        const accCodeId = account.accountingCode;
        if (!accCodeId) {
            return res.status(400).json({ success: false, message: "No accounting code linked to this bank account" });
        }

        const createdBy = req.user?._id || req.user?.id || req.user?.userId;
        const creatorRole = req.user?.role || "ADMIN";

        let balanceAccum = account.currentBalance || 0;
        const createdEntries = [];

        for (const tx of transactions) {
            const amount = Number(tx.amount) || 0;
            const txType = tx.type || (Number(tx.deposit) > 0 ? "DEBIT" : "CREDIT");

            if (txType === "DEBIT") {
                balanceAccum += amount;
            } else if (txType === "CREDIT") {
                balanceAccum -= amount;
            }

            const entry = new LedgerEntry({
                branch: branchId || undefined,
                accountingCode: accCodeId,
                type: txType,
                amount: amount,
                description: tx.description || `Bank statement transaction: ${tx.referenceNumber || ""}`,
                entryDate: tx.date ? new Date(tx.date) : new Date(),
                transactionId: tx.referenceNumber || undefined,
                transactionType: txType,
                runningBalance: balanceAccum,
                createdBy,
                creatorRole
            });

            await entry.save();
            createdEntries.push(entry);
        }

        account.currentBalance = balanceAccum;
        await account.save();

        res.status(200).json({
            success: true,
            message: `Successfully processed ${createdEntries.length} statement entries. New current balance is ${account.currentBalance}.`,
            data: createdEntries
        });
    } catch (error) {
        console.error("Error in uploadBankStatement controller:", error);
        next(error);
    }
};

exports.recordManualPayment = async (req, res, next) => {
    try {
        const { id } = req.params;
        const {
            amount,
            depositDate,
            paymentMode,
            description,
            currency,
            fromAccountId,
            branchId
        } = req.body;

        if (!amount) {
            return res.status(400).json({ success: false, message: "Amount is required" });
        }
        if (!depositDate) {
            return res.status(400).json({ success: false, message: "Deposit Date is required" });
        }
        if (!paymentMode) {
            return res.status(400).json({ success: false, message: "Payment Mode is required" });
        }
        if (!fromAccountId) {
            return res.status(400).json({ success: false, message: "From Account is required" });
        }

        const uploadLocal = require("../../../utils/uploadLocal");
        let supportingDocument;
        if (req.file) {
            const fileUrl = uploadLocal(req.file, "manual-payments");
            supportingDocument = {
                name: req.file.originalname,
                url: fileUrl,
                uploadedAt: new Date()
            };
        }

        const result = await BankAccountService.recordManualPayment(id, {
            amount: Number(amount),
            depositDate,
            paymentMode,
            description,
            currency,
            fromAccountId,
            branchId,
            supportingDocument,
            userId: req.user?._id || req.user?.id,
            userRole: req.user?.role
        });

        res.status(200).json({
            success: true,
            message: "Manual payment recorded successfully",
            data: result
        });
    } catch (error) {
        console.error("Record manual payment error:", error);
        next(error);
    }
};

exports.bulkUploadTransactions = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { branchId, transactions, clearExisting } = req.body;

        if (!transactions || !Array.isArray(transactions)) {
            return res.status(400).json({ success: false, message: "Invalid or empty transactions array" });
        }

        const BankAccount = require("../Model/BankAccountModel");
        const LedgerEntry = require("../../Ledger/Model/LedgerEntryModel");

        const account = await BankAccount.findOne({ _id: id, isDeleted: false });
        if (!account) {
            return res.status(404).json({ success: false, message: "Bank account not found" });
        }

        const accCodeId = account.accountingCode;
        if (!accCodeId) {
            return res.status(400).json({ success: false, message: "No accounting code linked to this bank account" });
        }

        const createdBy = req.user?._id || req.user?.id || req.user?.userId;
        const creatorRole = req.user?.role || "ADMIN";

        // If clearExisting is selected, purge existing ledger entries first
        if (clearExisting === true) {
            console.log(`[BulkUpload] Clearing existing ledger entries for account ${account.accountName}`);
            await LedgerEntry.deleteMany({ accountingCode: accCodeId });
            account.initialBalance = 0;
            account.currentBalance = 0;
        }

        let balanceAccum = account.currentBalance || 0;
        const createdEntries = [];

        for (const tx of transactions) {
            // Parse custom template headings:
            // Date, Description, Transaction Details, Debit, Credit, Running Balance, Transaction Type, Amount
            const dateVal = tx.Date || tx.date;
            const descVal = tx.Description || tx.description || "";
            const detailsVal = tx["Transaction Details"] || tx.transactionDetails || "";
            const debitVal = Number(tx.Debit || tx.debit) || 0;
            const creditVal = Number(tx.Credit || tx.credit) || 0;
            const runningBalVal = Number(tx["Running Balance"] || tx.runningBalance) || 0;
            let typeVal = String(tx["Transaction Type"] || tx.transactionType || "").trim().toUpperCase();
            let amountVal = Number(tx.Amount || tx.amount) || 0;

            // Resolve Type based on priority
            let resolvedType = "";

            // 1. Check Debit/Credit columns first
            if (debitVal > 0 && creditVal === 0) {
                resolvedType = "DEBIT";
            } else if (creditVal > 0 && debitVal === 0) {
                resolvedType = "CREDIT";
            }

            // 2. Check Amount suffix next
            if (!resolvedType) {
                const amountStr = String(tx.Amount || tx.amount || "").toUpperCase();
                if (amountStr.includes("DR")) {
                    resolvedType = "DEBIT";
                } else if (amountStr.includes("CR")) {
                    resolvedType = "CREDIT";
                }
            }

            // 3. Match from the user's specific transaction types
            if (!resolvedType) {
                const creditTypes = [
                    "CREDIT",
                    "EXPENSE",
                    "VENDOR PAYMENT",
                    "TRANSFER FUND",
                    "PAYMENT REFUND",
                    "SALES RETURN",
                    "WITHDRAWAL"
                ];
                if (creditTypes.includes(typeVal)) {
                    resolvedType = "CREDIT";
                } else {
                    // All others default to DEBIT (Customer Payment, Deposit, Expense Refund, Interest Income, Journal, Opening Balance, Other Income, Vendor Payment Refund, etc.)
                    resolvedType = "DEBIT";
                }
            }
            typeVal = resolvedType;

            // Resolve Amount
            if (amountVal <= 0) {
                amountVal = debitVal > 0 ? debitVal : (creditVal > 0 ? creditVal : 0);
            }

            // Combine Description and Details if both exist
            let finalDescription = descVal;
            if (detailsVal) {
                finalDescription = descVal ? `${descVal} - ${detailsVal}` : detailsVal;
            }

            if (typeVal === "DEBIT") {
                balanceAccum += amountVal;
            } else if (typeVal === "CREDIT") {
                balanceAccum -= amountVal;
            }

            const entry = new LedgerEntry({
                branch: branchId || undefined,
                accountingCode: accCodeId,
                type: typeVal,
                amount: amountVal,
                description: finalDescription || "Bulk uploaded ledger transaction",
                entryDate: dateVal ? new Date(dateVal) : new Date(),
                transactionType: typeVal,
                runningBalance: runningBalVal !== 0 ? runningBalVal : balanceAccum,
                createdBy,
                creatorRole
            });

            await entry.save();
            createdEntries.push(entry);
        }

        account.currentBalance = balanceAccum;
        await account.save();

        res.status(200).json({
            success: true,
            message: `Successfully processed ${createdEntries.length} bulk entries. New current balance is ${account.currentBalance}.`,
            data: {
                count: createdEntries.length,
                newBalance: account.currentBalance
            }
        });
    } catch (error) {
        console.error("Error in bulkUploadTransactions controller:", error);
        next(error);
    }
};