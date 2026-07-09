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
        const BankTransaction = require("../Model/BankTransactionModel");

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

        // Delete all bank transactions matching this bankAccount ID
        const bankTxDeleteResult = await BankTransaction.deleteMany({ bankAccount: id });

        // Reset balance
        account.initialBalance = 0;
        account.currentBalance = 0;
        await account.save();

        res.status(200).json({
            success: true,
            message: `Deleted ${deleteResult.deletedCount} ledger entries and ${bankTxDeleteResult.deletedCount} bank transactions. Balance reset to ${account.currentBalance}.`
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
        const BankTransaction = require("../Model/BankTransactionModel");

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

            const entry = new BankTransaction({
                bankAccount: id,
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
            branchId,
            customerId,
            invoiceId
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
            customerId,
            invoiceId,
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
        const BankTransaction = require("../Model/BankTransactionModel");

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

        // If clearExisting is selected, purge existing bank transactions first
        if (clearExisting === true) {
            console.log(`[BulkUpload] Clearing existing bank transactions for account ${account.accountName}`);
            await BankTransaction.deleteMany({ bankAccount: id });
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
            const detailsVal = tx["Transaction Details"] || tx.transactionDetails || tx.transaction_details || "";
            const debitVal = Number(tx.Debit || tx.debit) || 0;
            const creditVal = Number(tx.Credit || tx.credit) || 0;
            const runningBalVal = Number(tx["Running Balance"] || tx.runningBalance || tx.running_balance) || 0;
            let typeVal = String(tx["Transaction Type"] || tx.transactionType || tx.transaction_type || "").trim().toUpperCase();
            let amountVal = Number(tx.Amount || tx.amount) || 0;
            const transactionIdVal = tx.transactionId || tx.transaction_id || tx.referenceNumber || tx.reference_number || undefined;

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

            const entry = new BankTransaction({
                bankAccount: id,
                branch: branchId || undefined,
                accountingCode: accCodeId,
                type: typeVal,
                amount: amountVal,
                description: finalDescription || "Bulk uploaded ledger transaction",
                entryDate: dateVal ? new Date(dateVal) : new Date(),
                transactionType: typeVal,
                transactionId: transactionIdVal,
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

exports.getBankTransactions = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { page = 1, limit = 25, type, startDate, endDate, search, sort = "desc", balance } = req.query;

        const BankAccount = require("../Model/BankAccountModel");
        const LedgerEntry = require("../../Ledger/Model/LedgerEntryModel");

        const account = await BankAccount.findOne({ _id: id, isDeleted: false });
        if (!account) {
            return res.status(404).json({ success: false, message: "Bank account not found" });
        }

        if (!account.accountingCode) {
            return res.status(200).json({
                success: true,
                data: [],
                pagination: {
                    total: 0,
                    pages: 1,
                    limit: parseInt(limit, 10),
                    page: parseInt(page, 10)
                }
            });
        }

        const query = { accountingCode: account.accountingCode };

        if (type) {
            query.type = type.toUpperCase();
        }

        if (startDate || endDate) {
            query.entryDate = {};
            if (startDate) {
                query.entryDate.$gte = new Date(startDate);
            }
            if (endDate) {
                query.entryDate.$lte = new Date(endDate);
            }
        }

        if (balance) {
            const balNum = parseFloat(balance);
            if (!isNaN(balNum)) {
                query.runningBalance = { $gte: balNum - 0.01, $lte: balNum + 0.01 };
            }
        }

        if (search) {
            const searchConditions = [
                { description: { $regex: search, $options: "i" } },
                { transactionId: { $regex: search, $options: "i" } }
            ];
            const searchNum = parseFloat(search);
            if (!isNaN(searchNum)) {
                searchConditions.push({
                    runningBalance: { $gte: searchNum - 0.01, $lte: searchNum + 0.01 }
                });
            }
            query.$or = searchConditions;
        }

        const pageNum = parseInt(page, 10);
        const limitNum = parseInt(limit, 10);
        const skip = (pageNum - 1) * limitNum;

        const total = await LedgerEntry.countDocuments(query);
        const sortOrder = sort === "asc" ? 1 : -1;
        const transactions = await LedgerEntry.find(query)
            .sort({ entryDate: sortOrder, createdAt: sortOrder })
            .skip(skip)
            .limit(limitNum);

        // Map transactions to mimic LedgerEntry fields for frontend compatibility
        const mappedTransactions = transactions.map(tx => {
            const obj = tx.toObject();
            obj.date = tx.entryDate;
            obj.referenceId = tx.transactionId; // mapping transactionId to referenceId
            return obj;
        });

        res.status(200).json({
            success: true,
            data: mappedTransactions,
            pagination: {
                total,
                page: pageNum,
                limit: limitNum,
                totalPages: Math.ceil(total / limitNum)
            }
        });
    } catch (error) {
        console.error("Error in getBankTransactions controller:", error);
        next(error);
    }
};

exports.getBankTransactionById = async (req, res, next) => {
    try {
        const { transactionId } = req.params;
        const BankTransaction = require("../Model/BankTransactionModel");
        const LedgerEntry = require("../../Ledger/Model/LedgerEntryModel");

        let transaction = await BankTransaction.findById(transactionId)
            .populate("bankAccount", "accountName bankName accountNumber currency status")
            .populate("branch", "name code")
            .populate("accountingCode", "code name category")
            .populate("createdBy", "name email");

        if (!transaction) {
            const ledgerEntry = await LedgerEntry.findById(transactionId)
                .populate("branch", "name code")
                .populate("accountingCode", "code name category")
                .populate("createdBy", "name email");

            if (ledgerEntry) {
                transaction = ledgerEntry.toObject();
                transaction.entryDate = ledgerEntry.entryDate;
                transaction.transactionId = ledgerEntry.transactionId;
                
                const BankAccount = require("../Model/BankAccountModel");
                const matchedAccount = await BankAccount.findOne({ accountingCode: ledgerEntry.accountingCode, isDeleted: false });
                transaction.bankAccount = matchedAccount ? {
                    _id: matchedAccount._id,
                    accountName: matchedAccount.accountName || matchedAccount.bankName,
                    bankName: matchedAccount.bankName,
                    accountNumber: matchedAccount.accountNumber,
                    currency: matchedAccount.currency,
                    status: matchedAccount.status
                } : null;
            }
        }

        if (!transaction) {
            return res.status(404).json({ success: false, message: "Bank transaction not found" });
        }

        res.status(200).json({
            success: true,
            data: transaction
        });
    } catch (error) {
        console.error("Error in getBankTransactionById controller:", error);
        next(error);
    }
};