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

        // Reset balance to initial balance
        account.currentBalance = account.initialBalance || 0;
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
        const LedgerEntry = require("../../Ledger/Model/LedgerEntryModel");

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

            const ledgerEntry = new LedgerEntry({
                branch: branchId || undefined,
                accountingCode: accCodeId,
                type: txType,
                amount: amount,
                description: tx.description || `Bank statement transaction: ${tx.referenceNumber || ""}`,
                entryDate: tx.date ? new Date(tx.date) : new Date(),
                transactionId: tx.referenceNumber || undefined,
                runningBalance: balanceAccum,
                createdBy,
                creatorRole
            });

            await ledgerEntry.save();
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

const parseDateFlexible = (val) => {
    if (val === undefined || val === null) return null;
    if (typeof val === 'number') {
        const totalDays = Math.floor(val - 25569);
        const date = new Date(Date.UTC(1970, 0, 1 + totalDays));
        return isNaN(date.getTime()) ? null : date;
    }
    const str = String(val).trim();
    if (!str) return null;
    if (/^\d{5}(\.\d+)?$/.test(str)) {
        const num = parseFloat(str);
        const totalDays = Math.floor(num - 25569);
        const date = new Date(Date.UTC(1970, 0, 1 + totalDays));
        return isNaN(date.getTime()) ? null : date;
    }
    const parts = str.split(/[\/\-.]/);
    if (parts.length === 3) {
        if (parts[0].length === 4) {
            const year = parseInt(parts[0], 10);
            const month = parseInt(parts[1], 10) - 1;
            const day = parseInt(parts[2], 10);
            const date = new Date(Date.UTC(year, month, day));
            if (!isNaN(date.getTime())) return date;
        } else {
            const part1 = parseInt(parts[0], 10);
            const part2 = parseInt(parts[1], 10);
            const part3 = parseInt(parts[2], 10);
            const year = part3 < 100 ? 2000 + part3 : part3;
            const day = part1;
            const month = part2;
            const date = new Date(Date.UTC(year, month - 1, day));
            if (!isNaN(date.getTime())) return date;
        }
    }
    const fallback = new Date(str);
    if (isNaN(fallback.getTime())) return null;
    const date = new Date(Date.UTC(fallback.getFullYear(), fallback.getMonth(), fallback.getDate()));
    return date;
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
        const LedgerEntry = require("../../Ledger/Model/LedgerEntryModel");
        const Branch = require("../../Branch/Model/BranchModel");

        const allBranches = await Branch.find({ isDeleted: false, status: "ACTIVE" });

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

        const AccountingCode = require("../../AccountingCode/Model/AccountingCodeModel");
        const accountingCodeDoc = await AccountingCode.findOne({ _id: accCodeId });
        if (!accountingCodeDoc) {
            return res.status(400).json({ success: false, message: "Linked accounting code not found" });
        }

        let balanceAccum = 0;
        let debitAccum = 0;
        let creditAccum = 0;

        if (clearExisting === true) {
            console.log(`[BulkUpload] Clearing existing bank transactions for account ${account.accountName}`);
            await BankTransaction.deleteMany({ bankAccount: id });
            await LedgerEntry.deleteMany({ accountingCode: accCodeId });
            balanceAccum = account.initialBalance || 0;
            debitAccum = 0;
            creditAccum = 0;
        } else {
            const lastTx = await LedgerEntry.findOne({ accountingCode: accCodeId })
                .sort({ entryDate: -1, _id: -1 });
            
            if (lastTx) {
                console.log(`[BulkUpload] Found last LedgerEntry in DB to connect with: ID=${lastTx._id}, Date=${lastTx.entryDate}, Type=${lastTx.type}, Amount=${lastTx.amount}, RunningBalance=${lastTx.runningBalance}`);
                balanceAccum = lastTx.runningBalance || 0;
                debitAccum = accountingCodeDoc.debitTotal || 0;
                creditAccum = accountingCodeDoc.creditTotal || 0;
            } else {
                console.log(`[BulkUpload] No LedgerEntry found in DB. Falling back to account currentBalance: ${account.currentBalance || 0}`);
                balanceAccum = account.currentBalance || account.initialBalance || 0;
                debitAccum = accountingCodeDoc.debitTotal || 0;
                creditAccum = accountingCodeDoc.creditTotal || 0;
            }
        }
        const createdEntries = [];

        for (const tx of transactions) {
            // Parse custom template headings and support the new sample file headings:
            const dateVal = tx.DATE || tx.Date || tx.date;
            const finalEntryDate = parseDateFlexible(dateVal) || new Date();
            const prefixVal = tx.PREFIX || tx.prefix;
            const numberVal = tx.NUMBER || tx.number;
            const bankNameVal = tx["BANK NAME"] || tx.bankName || tx.bank_name;
            const accountsNameVal = tx["ACCOUNTS NAME"] || tx.accountsName || tx.accounts_name;
            const receiptVal = Number(tx.RECEIPT || tx.Receipt || tx.debit || tx.Debit) || 0;
            const paymentVal = Number(tx.PAYMENT || tx.Payment || tx.credit || tx.Credit) || 0;
            const descVal = tx.DESCRIPTION || tx.Description || tx.description || "";
            const remarksVal = tx.REMARKS || tx.Remarks || tx["Transaction Details"] || tx.transactionDetails || tx.transaction_details || "";
            const branchVal = tx.BRANCH || tx.Branch || tx.branch || "";

            let resolvedBranchId = null;
            if (branchVal) {
                const trimmedVal = String(branchVal).trim().toLowerCase();
                // 1. Try exact name match
                let match = allBranches.find(b => b.name.trim().toLowerCase() === trimmedVal);
                
                // 2. Try partial name match
                if (!match) {
                    match = allBranches.find(b => {
                        const dbName = b.name.trim().toLowerCase();
                        return dbName.includes(trimmedVal) || trimmedVal.includes(dbName);
                    });
                }
                
                // 3. Try matching by type if no name matches
                if (!match) {
                    const isWorkshopType = trimmedVal.includes("workshop") || trimmedVal.includes("taller");
                    const targetType = isWorkshopType ? "WORKSHOP" : "BRANCH";
                    match = allBranches.find(b => b.type === targetType);
                }

                if (match) {
                    resolvedBranchId = match._id;
                }
            }

            // Ultimate fallback to first branch if still not resolved
            if (!resolvedBranchId && allBranches.length > 0) {
                resolvedBranchId = allBranches[0]._id;
            }

            // Verify the bank name in the Excel row matches the selected bank account (case-insensitive checks)
            if (bankNameVal) {
                const excelBank = String(bankNameVal).trim().toLowerCase();
                const selBank = String(account.bankName || "").trim().toLowerCase();
                const selAccName = String(account.accountName || "").trim().toLowerCase();
                
                const isMatch = (
                    excelBank.includes(selBank) ||
                    selBank.includes(excelBank) ||
                    excelBank.includes(selAccName) ||
                    selAccName.includes(excelBank)
                );
                
                if (!isMatch) {
                    return res.status(400).json({
                        success: false,
                        message: `Bank name mismatch in file row: "${bankNameVal}", but target bank account is "${account.accountName || account.bankName}".`
                    });
                }
            }

            // Combine PREFIX & NUMBER for transaction ID
            let transactionIdVal = tx.transactionId || tx.transaction_id || tx.referenceNumber || tx.reference_number || undefined;
            if (prefixVal !== undefined && numberVal !== undefined && prefixVal !== null && numberVal !== null) {
                transactionIdVal = `${String(prefixVal).trim()}${String(numberVal).trim()}`;
            }

            // Polarity: RECEIPT = DEBIT, PAYMENT = CREDIT
            let typeVal = "DEBIT";
            if (receiptVal > 0 && paymentVal === 0) {
                typeVal = "DEBIT";
            } else if (paymentVal > 0 && receiptVal === 0) {
                typeVal = "CREDIT";
            } else if (receiptVal > 0 && paymentVal > 0) {
                // If both are provided, default to DEBIT
                typeVal = "DEBIT";
            } else {
                // Check if any legacy transaction type is passed
                const rawType = String(tx["Transaction Type"] || tx.transactionType || tx.transaction_type || "").trim().toUpperCase();
                const creditTypes = [
                    "CREDIT",
                    "EXPENSE",
                    "VENDOR PAYMENT",
                    "TRANSFER FUND",
                    "PAYMENT REFUND",
                    "SALES RETURN",
                    "WITHDRAWAL"
                ];
                if (creditTypes.includes(rawType)) {
                    typeVal = "CREDIT";
                }
            }

            const amountVal = receiptVal > 0 ? receiptVal : paymentVal;

            // Combine Description and Remarks if both exist
            let finalDescription = descVal;
            if (remarksVal) {
                finalDescription = descVal ? `${descVal} - ${remarksVal}` : remarksVal;
            }

            const isCreditCard = account.accountType === "Credit Card";
            if (typeVal === "DEBIT") {
                balanceAccum = isCreditCard ? (balanceAccum - amountVal) : (balanceAccum + amountVal);
                debitAccum += amountVal;
            } else if (typeVal === "CREDIT") {
                balanceAccum = isCreditCard ? (balanceAccum + amountVal) : (balanceAccum - amountVal);
                creditAccum += amountVal;
            }

            const entry = new BankTransaction({
                bankAccount: id,
                branch: resolvedBranchId || branchId || undefined,
                accountingCode: accCodeId,
                type: typeVal,
                amount: amountVal,
                description: finalDescription || "Bulk uploaded ledger transaction",
                entryDate: finalEntryDate,
                transactionType: typeVal,
                transactionId: transactionIdVal,
                runningBalance: balanceAccum,
                createdBy,
                creatorRole
            });

            await entry.save();

            const ledgerEntry = new LedgerEntry({
                branch: resolvedBranchId || branchId || undefined,
                accountingCode: accCodeId,
                type: typeVal,
                amount: amountVal,
                description: finalDescription || "Bulk uploaded ledger transaction",
                entryDate: finalEntryDate,
                transactionId: transactionIdVal,
                runningBalance: balanceAccum,
                createdBy,
                creatorRole
            });

            await ledgerEntry.save();
            createdEntries.push(entry);
        }

        account.currentBalance = balanceAccum;
        await account.save();

        // Sync and update the linked accounting code totals and currentBalance
        accountingCodeDoc.debitTotal = debitAccum;
        accountingCodeDoc.creditTotal = creditAccum;
        accountingCodeDoc.currentBalance = balanceAccum;
        await accountingCodeDoc.save();

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
            .sort({ entryDate: sortOrder, _id: sortOrder })
            .skip(skip)
            .limit(limitNum);

        // Map transactions to mimic LedgerEntry fields for frontend compatibility
        const mappedTransactions = transactions.map(tx => {
            const obj = tx.toObject();
            obj.date = tx.entryDate;
            obj.referenceId = tx.transactionId; // mapping transactionId to referenceId
            return obj;
        });

        // Calculate total deposits and withdrawals matching the query
        const totalsResult = await LedgerEntry.aggregate([
            { $match: query },
            {
                $group: {
                    _id: null,
                    totalDeposits: {
                        $sum: {
                            $cond: [{ $eq: ["$type", "DEBIT"] }, "$amount", 0]
                        }
                    },
                    totalWithdrawals: {
                        $sum: {
                            $cond: [{ $eq: ["$type", "CREDIT"] }, "$amount", 0]
                        }
                    }
                }
            }
        ]);
        const totalDeposits = totalsResult.length > 0 ? totalsResult[0].totalDeposits : 0;
        const totalWithdrawals = totalsResult.length > 0 ? totalsResult[0].totalWithdrawals : 0;

        // Calculate dynamic opening balance for the filtered period
        let openingBalance = account.initialBalance || 0;
        if (startDate) {
            const priorQuery = {
                accountingCode: account.accountingCode,
                entryDate: { $lt: new Date(startDate) }
            };
            const priorTotals = await LedgerEntry.aggregate([
                { $match: priorQuery },
                {
                    $group: {
                        _id: null,
                        totalDeposits: {
                            $sum: {
                                $cond: [{ $eq: ["$type", "DEBIT"] }, "$amount", 0]
                            }
                        },
                        totalWithdrawals: {
                            $sum: {
                                $cond: [{ $eq: ["$type", "CREDIT"] }, "$amount", 0]
                            }
                        }
                    }
                }
            ]);

            if (priorTotals.length > 0) {
                const priorDebits = priorTotals[0].totalDeposits || 0;
                const priorCredits = priorTotals[0].totalWithdrawals || 0;
                const isCreditCard = account.accountType === "Credit Card";
                openingBalance = isCreditCard
                    ? (priorCredits - priorDebits)
                    : (priorDebits - priorCredits);
            }
        }

        res.status(200).json({
            success: true,
            data: mappedTransactions,
            pagination: {
                total,
                page: pageNum,
                limit: limitNum,
                totalPages: Math.ceil(total / limitNum)
            },
            totalDeposits,
            totalWithdrawals,
            openingBalance
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

exports.bulkDeleteTransactions = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { transactionIds } = req.body;

        if (!transactionIds || !Array.isArray(transactionIds) || transactionIds.length === 0) {
            return res.status(400).json({ success: false, message: "transactionIds is required and must be a non-empty array" });
        }

        const result = await BankAccountService.bulkDeleteTransactions(id, transactionIds);
        res.status(200).json({
            success: true,
            message: `Successfully deleted ${result.deletedCount} transactions and updated balances`,
            data: result
        });
    } catch (error) {
        console.error("Error in bulkDeleteTransactions controller:", error);
        next(error);
    }
};

exports.bulkEditTransactions = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { updates } = req.body;

        if (!updates || !Array.isArray(updates) || updates.length === 0) {
            return res.status(400).json({ success: false, message: "updates is required and must be a non-empty array" });
        }

        const result = await BankAccountService.bulkEditTransactions(id, updates);
        res.status(200).json({
            success: true,
            message: "Successfully updated transactions and updated balances",
            data: result
        });
    } catch (error) {
        console.error("Error in bulkEditTransactions controller:", error);
        next(error);
    }
};

exports.getBankAccountLedgerPdf = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { startDate, endDate, search, sort = "asc" } = req.query;

        const BankAccount = require("../Model/BankAccountModel");
        const LedgerEntry = require("../../Ledger/Model/LedgerEntryModel");
        const BankAccountLedgerPdfService = require("../Service/BankAccountLedgerPdfService");

        const account = await BankAccount.findOne({ _id: id, isDeleted: false });
        if (!account) {
            return res.status(404).json({ success: false, message: "Bank account not found" });
        }

        if (!account.accountingCode) {
            return res.status(400).json({ success: false, message: "No accounting code linked to this bank account" });
        }

        const query = { accountingCode: account.accountingCode };

        if (startDate || endDate) {
            query.entryDate = {};
            if (startDate) {
                query.entryDate.$gte = new Date(startDate);
            }
            if (endDate) {
                query.entryDate.$lte = new Date(endDate);
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

        // For statements, we sort oldest first (asc) to calculate/display the running balance progression
        const sortOrder = sort === "desc" ? -1 : 1;
        const transactions = await LedgerEntry.find(query)
            .sort({ entryDate: sortOrder, _id: sortOrder });

        // Calculate opening balance
        let openingBalance = account.initialBalance || 0;
        if (startDate) {
            const priorTotals = await LedgerEntry.aggregate([
                {
                    $match: {
                        accountingCode: account.accountingCode,
                        entryDate: { $lt: new Date(startDate) }
                    }
                },
                {
                    $group: {
                        _id: null,
                        totalDeposits: {
                            $sum: {
                                $cond: [{ $eq: ["$type", "DEBIT"] }, "$amount", 0]
                            }
                        },
                        totalWithdrawals: {
                            $sum: {
                                $cond: [{ $eq: ["$type", "CREDIT"] }, "$amount", 0]
                            }
                        }
                    }
                }
            ]);

            if (priorTotals.length > 0) {
                const priorDebits = priorTotals[0].totalDeposits || 0;
                const priorCredits = priorTotals[0].totalWithdrawals || 0;
                const isCreditCard = account.accountType === "Credit Card";
                openingBalance = isCreditCard
                    ? (account.initialBalance || 0) + (priorCredits - priorDebits)
                    : (account.initialBalance || 0) + (priorDebits - priorCredits);
            }
        }

        // Set response headers for PDF download/viewing
        const safeName = (account.accountName || account.bankName || "Account").replace(/\s+/g, "_");
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader(
            "Content-Disposition",
            `inline; filename="Ledger_Statement_${safeName}.pdf"`
        );

        BankAccountLedgerPdfService.generateLedgerPdf(
            account,
            transactions,
            openingBalance,
            { startDate, endDate },
            res
        );
    } catch (error) {
        console.error("Error in getBankAccountLedgerPdf controller:", error);
        next(error);
    }
};