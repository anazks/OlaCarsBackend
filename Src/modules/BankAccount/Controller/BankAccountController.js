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

        const { syncAccountingCodeBalances } = require("../Service/BankAccountService");
        if (accCodeId) {
            await syncAccountingCodeBalances(accCodeId);
        }

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

        const ManualJournalService = require("../../Ledger/Service/ManualJournalService");
        const AccountingCode = require("../../AccountingCode/Model/AccountingCodeModel");
        const arCodeDoc = await AccountingCode.findOne({
            $or: [
                { code: "1.1.03" },
                { code: "1200" },
                { name: { $regex: /Accounts Receivable/i } },
                { name: { $regex: /Cuenta por Cobrar/i } }
            ],
            isDeleted: { $ne: true }
        });

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

            const journalPayload = {
                description: tx.description || `Bank statement transaction: ${tx.referenceNumber || ""}`,
                date: tx.date ? new Date(tx.date) : new Date(),
                branch: branchId || undefined,
                lines: [
                    {
                        accountingCode: accCodeId,
                        type: txType,
                        amount: amount,
                        description: tx.description || `Bank statement transaction: ${tx.referenceNumber || ""}`
                    },
                    {
                        accountingCode: arCodeDoc ? arCodeDoc._id : accCodeId,
                        type: txType === "DEBIT" ? "CREDIT" : "DEBIT",
                        amount: amount,
                        description: tx.description || `Bank statement transaction offset`
                    }
                ],
                createdBy,
                creatorRole
            };

            await ManualJournalService.createManualJournal(journalPayload);

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
            toAccountId,
            branchId,
            customerId,
            invoiceId,
            entryType: rawEntryType,
            type: rawType
        } = req.body;

        const entryType = (rawEntryType || rawType || "RECEIPT").toUpperCase();
        
        const cleanCustomerId = (customerId && customerId !== "undefined" && customerId !== "null" && String(customerId).trim() !== "") ? String(customerId).trim() : null;
        const cleanInvoiceId = (invoiceId && invoiceId !== "undefined" && invoiceId !== "null" && String(invoiceId).trim() !== "") ? String(invoiceId).trim() : null;
        const cleanToAccountId = (toAccountId && toAccountId !== "undefined" && toAccountId !== "null" && String(toAccountId).trim() !== "") ? String(toAccountId).trim() : null;
        const cleanFromAccountId = (fromAccountId && fromAccountId !== "undefined" && fromAccountId !== "null" && String(fromAccountId).trim() !== "") ? String(fromAccountId).trim() : null;
        const targetOffsetAccountId = cleanToAccountId || cleanFromAccountId;

        if (!amount) {
            return res.status(400).json({ success: false, message: "Amount is required" });
        }
        if (!depositDate) {
            return res.status(400).json({ success: false, message: "Deposit Date is required" });
        }
        if (!paymentMode) {
            return res.status(400).json({ success: false, message: "Payment Mode is required" });
        }
        if (entryType === "PAYMENT" && !targetOffsetAccountId) {
            return res.status(400).json({ success: false, message: "To Account (Destination / Offset Account) is required for Payment" });
        }
        if (entryType === "RECEIPT" && !cleanCustomerId && !targetOffsetAccountId) {
            return res.status(400).json({ success: false, message: "Please select either a Customer or a To Account for Receipt" });
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
            fromAccountId: targetOffsetAccountId,
            toAccountId: targetOffsetAccountId,
            branchId,
            supportingDocument,
            customerId: cleanCustomerId,
            invoiceId: cleanInvoiceId,
            entryType,
            userId: req.user?._id || req.user?.id,
            userRole: req.user?.role
        });

        res.status(200).json({
            success: true,
            message: `${entryType === "PAYMENT" ? "Payment (Money Out)" : "Receipt (Money In)"} recorded successfully`,
            data: result
        });
    } catch (error) {
        console.error("Record manual payment error:", error);
        next(error);
    }
};

const parseDateFlexible = (val) => {
    if (val === undefined || val === null) return null;
    if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
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
        let year = 0, month = 0, day = 0;
        if (parts[0].length === 4) {
            year = parseInt(parts[0], 10);
            month = parseInt(parts[1], 10);
            day = parseInt(parts[2], 10);
        } else if (parts[2].length === 4 || parts[2].length === 2) {
            const p1 = parseInt(parts[0], 10);
            const p2 = parseInt(parts[1], 10);
            const p3 = parseInt(parts[2], 10);
            year = p3 < 100 ? 2000 + p3 : p3;

            if (p1 > 12 && p2 <= 12) {
                day = p1;
                month = p2;
            } else if (p1 <= 12 && p2 > 12) {
                month = p1;
                day = p2;
            } else {
                // Default to DD-MM-YYYY format
                day = p1;
                month = p2;
            }
        }
        if (year && month && day) {
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

        const arCodeDoc = await AccountingCode.findOne({
            $or: [
                { code: "1.1.03" },
                { code: "1200" },
                { name: { $regex: /Accounts Receivable/i } },
                { name: { $regex: /Cuenta por Cobrar/i } }
            ],
            isDeleted: { $ne: true }
        });

        const apCodeDoc = await AccountingCode.findOne({
            $or: [
                { code: "2.1.01" },
                { code: "2000" },
                { name: { $regex: /Accounts Payable/i } },
                { name: { $regex: /Cuenta por Pagar/i } }
            ],
            isDeleted: { $ne: true }
        });


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
        let setOffResults = [];
        const seenTxIdsInFile = new Set();

        const getISTNow = () => {
            const now = new Date();
            return new Date(now.getTime() + (5.5 * 60 * 60 * 1000) + (now.getTimezoneOffset() * 60 * 1000));
        };

        for (const tx of transactions) {
            // Parse custom template headings and support the new sample file headings:
            const dateVal = tx.DATE || tx.Date || tx.date;
            const baseDate = parseDateFlexible(dateVal);
            let finalEntryDate = getISTNow();
            if (baseDate) {
                const uploadTimeIST = getISTNow();
                finalEntryDate = new Date(
                    baseDate.getUTCFullYear(),
                    baseDate.getUTCMonth(),
                    baseDate.getUTCDate(),
                    uploadTimeIST.getHours(),
                    uploadTimeIST.getMinutes(),
                    uploadTimeIST.getSeconds(),
                    uploadTimeIST.getMilliseconds()
                );
            }
            const prefixVal = tx.PREFIX || tx.prefix;
            const numberVal = tx.NUMBER || tx.number;
            const bankNameVal = tx["BANK NAME"] || tx.bankName || tx.bank_name;
            const accountsNameVal = tx["SUB ACCOUNT"] || tx.subAccount || tx.sub_account || tx["ACCOUNTS NAME"] || tx.accountsName || tx.accounts_name;
            const parentAccountVal = tx["PARENT ACCOUNT"] || tx.parentAccount || tx.parent_account;
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

            // Validate Transaction ID uniqueness against DB and upload file
            if (transactionIdVal && String(transactionIdVal).trim()) {
                const cleanTxId = String(transactionIdVal).trim();

                if (seenTxIdsInFile.has(cleanTxId)) {
                    return res.status(400).json({
                        success: false,
                        message: `Invalid upload: Duplicate Transaction ID "${cleanTxId}" appears multiple times in the upload file.`
                    });
                }
                seenTxIdsInFile.add(cleanTxId);

                const LedgerEntry = require("../../Ledger/Model/LedgerEntryModel");
                const existingEntry = await LedgerEntry.findOne({ transactionId: cleanTxId, isDeleted: { $ne: true } });
                if (existingEntry) {
                    return res.status(400).json({
                        success: false,
                        message: `Invalid upload: Transaction ID "${cleanTxId}" already exists in ledger entries.`
                    });
                }
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

            // Resolve entity names from transaction row
            const driverNameVal = tx["DRIVER NAME"] || tx["DRIVER"] || tx.driverName || tx.driver_name;
            const supplierNameVal = tx["SUPPLIER NAME"] || tx.supplierName || tx.supplier_name;
            const customerNameVal = tx["CUSTOMER NAME"] || tx.customerName || tx.customer_name;

            const customerIdVal = tx.customerId || tx.customer;
            const supplierIdVal = tx.supplierId || tx.supplier;

            const filledEntityCount = [
                driverNameVal && String(driverNameVal).trim(),
                supplierNameVal && String(supplierNameVal).trim(),
                customerNameVal && String(customerNameVal).trim()
            ].filter(Boolean).length;

            if (filledEntityCount > 1) {
                return res.status(400).json({
                    success: false,
                    message: `Row cannot contain more than one entity (DRIVER NAME, SUPPLIER NAME, CUSTOMER NAME) simultaneously.`
                });
            }

            let customerDoc = null;
            let supplierDoc = null;
            let isDriver = false;
            let isCustomer = false;

            if (driverNameVal && String(driverNameVal).trim()) {
                isDriver = true;
                const Customer = require("../../Customer/Model/CustomerModel");
                const { Driver } = require("../../Driver/Model/DriverModel");
                const rawName = String(driverNameVal).trim();
                const escapedName = rawName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

                const driverDoc = await Driver.findOne({
                    $or: [
                        { name: { $regex: new RegExp("^" + escapedName + "$", "i") } },
                        { firstName: { $regex: new RegExp("^" + escapedName + "$", "i") } },
                        { driverId: { $regex: new RegExp("^" + escapedName + "$", "i") } }
                    ],
                    isDeleted: { $ne: true }
                });

                if (driverDoc) {
                    customerDoc = await Customer.findOne({ driver: driverDoc._id, isDeleted: false });
                }

                if (!customerDoc) {
                    customerDoc = await Customer.findOne({
                        $or: [
                            { name: { $regex: new RegExp("^" + escapedName + "$", "i") } },
                            { companyName: { $regex: new RegExp("^" + escapedName + "$", "i") } },
                            { displayName: { $regex: new RegExp("^" + escapedName + "$", "i") } },
                            { customerNumber: { $regex: new RegExp("^" + escapedName + "$", "i") } }
                        ],
                        isDeleted: false
                    });
                }
            } else if (customerIdVal || (customerNameVal && String(customerNameVal).trim())) {
                isCustomer = true;
                const Customer = require("../../Customer/Model/CustomerModel");
                if (customerIdVal) {
                    customerDoc = await Customer.findOne({ _id: customerIdVal, isDeleted: false });
                } else {
                    const rawName = String(customerNameVal).trim();
                    const escapedName = rawName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

                    customerDoc = await Customer.findOne({
                        $or: [
                            { name: { $regex: new RegExp("^" + escapedName + "$", "i") } },
                            { companyName: { $regex: new RegExp("^" + escapedName + "$", "i") } },
                            { displayName: { $regex: new RegExp("^" + escapedName + "$", "i") } },
                            { customerNumber: { $regex: new RegExp("^" + escapedName + "$", "i") } }
                        ],
                        isDeleted: false
                    });

                    if (!customerDoc) {
                        customerDoc = await Customer.findOne({
                            $or: [
                                { name: { $regex: new RegExp(escapedName, "i") } },
                                { companyName: { $regex: new RegExp(escapedName, "i") } },
                                { displayName: { $regex: new RegExp(escapedName, "i") } }
                            ],
                            isDeleted: false
                        });
                    }

                    if (!customerDoc) {
                        const cleanWords = rawName.replace(/[,.-]/g, ' ').replace(/\s+/g, ' ').trim();
                        if (cleanWords) {
                            const fuzzyPattern = cleanWords.split(' ').filter(Boolean).map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[\\s,.-]*');
                            customerDoc = await Customer.findOne({
                                $or: [
                                    { name: { $regex: new RegExp(fuzzyPattern, "i") } },
                                    { companyName: { $regex: new RegExp(fuzzyPattern, "i") } },
                                    { displayName: { $regex: new RegExp(fuzzyPattern, "i") } }
                                ],
                                isDeleted: false
                            });
                        }
                    }
                }
            }

            if (supplierIdVal || (supplierNameVal && String(supplierNameVal).trim())) {
                const Supplier = require("../../Supplier/Model/SupplierModel");
                if (supplierIdVal) {
                    supplierDoc = await Supplier.findOne({ _id: supplierIdVal, isDeleted: { $ne: true } });
                } else {
                    const rawSupName = String(supplierNameVal).trim();
                    const escapedSupName = rawSupName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

                    supplierDoc = await Supplier.findOne({
                        $or: [
                            { name: { $regex: new RegExp("^" + escapedSupName + "$", "i") } },
                            { companyName: { $regex: new RegExp("^" + escapedSupName + "$", "i") } },
                            { displayName: { $regex: new RegExp("^" + escapedSupName + "$", "i") } },
                            { vendorNumber: { $regex: new RegExp("^" + escapedSupName + "$", "i") } },
                            { supplierCode: { $regex: new RegExp("^" + escapedSupName + "$", "i") } }
                        ],
                        isDeleted: { $ne: true }
                    });

                    if (!supplierDoc) {
                        supplierDoc = await Supplier.findOne({
                            $or: [
                                { name: { $regex: new RegExp(escapedSupName, "i") } },
                                { companyName: { $regex: new RegExp(escapedSupName, "i") } }
                            ],
                            isDeleted: { $ne: true }
                        });
                    }
                }
            }

            const isCreditCard = account.accountType === "Credit Card";

            // If driver is resolved and it's a DEBIT (money incoming / receipt), auto set-off against unpaid invoices
            if (customerDoc && isDriver && typeVal === "DEBIT") {
                if (typeVal === "DEBIT") {
                    balanceAccum = isCreditCard ? (balanceAccum - amountVal) : (balanceAccum + amountVal);
                    debitAccum += amountVal;
                } else if (typeVal === "CREDIT") {
                    balanceAccum = isCreditCard ? (balanceAccum + amountVal) : (balanceAccum - amountVal);
                    creditAccum += amountVal;
                }

                const { autoSetOffInvoices } = require("../Service/BankAccountService");
                const mongoose = require("mongoose");
                const bankTxId = new mongoose.Types.ObjectId();

                const setOffResult = await autoSetOffInvoices(customerDoc._id, amountVal, {
                    bankAccountingCodeId: accCodeId,
                    bankTransactionId: bankTxId,
                    bankAccountId: id,
                    branchId: resolvedBranchId || branchId,
                    entryDate: finalEntryDate,
                    description: finalDescription || `Bank statement receipt`,
                    transactionId: transactionIdVal,
                    createdBy,
                    creatorRole
                });

                // Build invoice numbers string for the description
                const invoiceNumbers = setOffResult.invoicesSetOff.map(inv => inv.invoiceNumber).join(", ");
                const setOffDesc = setOffResult.invoicesSetOff.length > 0
                    ? `${finalDescription || "Receipt"} - Set off: ${invoiceNumbers}`
                    : finalDescription || "Receipt - No unpaid invoices to set off";

                const entry = new LedgerEntry({
                    _id: bankTxId,
                    branch: resolvedBranchId || branchId || undefined,
                    accountingCode: accCodeId,
                    type: typeVal,
                    amount: amountVal,
                    description: setOffDesc,
                    entryDate: finalEntryDate,
                    transactionId: transactionIdVal,
                    runningBalance: balanceAccum,
                    contact: customerDoc._id,
                    contactModel: "Customer",
                    bankTxType: "DRIVER",
                    invoices: setOffResult.invoicesSetOff.map(inv => ({
                        invoiceId: inv.invoiceId,
                        invoiceNumber: inv.invoiceNumber,
                        amountApplied: inv.amountApplied
                    })),
                    setOffSummary: {
                        totalSetOff: setOffResult.totalSetOff,
                        invoiceCount: setOffResult.invoicesSetOff.length,
                        excessAmount: setOffResult.excessAmount
                    },
                    createdBy,
                    creatorRole
                });
                await entry.save();
                createdEntries.push(entry);

                // Track set-off results for the response
                setOffResults.push({
                    transactionId: transactionIdVal,
                    customerName: customerDoc.name,
                    amount: amountVal,
                    ...setOffResult
                });

                continue;
            }

            // If supplier is resolved and it's a CREDIT (money outgoing / vendor payment), auto set-off against unpaid bills
            if (supplierDoc && typeVal === "CREDIT") {
                balanceAccum = isCreditCard ? (balanceAccum + amountVal) : (balanceAccum - amountVal);
                creditAccum += amountVal;

                const { autoSetOffBills } = require("../Service/BankAccountService");
                const mongoose = require("mongoose");
                const bankTxId = new mongoose.Types.ObjectId();

                const setOffResult = await autoSetOffBills(supplierDoc._id, amountVal, {
                    bankAccountingCodeId: accCodeId,
                    bankTransactionId: bankTxId,
                    bankAccountId: id,
                    branchId: resolvedBranchId || branchId,
                    entryDate: finalEntryDate,
                    description: finalDescription || `Bank statement vendor payment`,
                    transactionId: transactionIdVal,
                    paymentMethod: "Bank Transfer",
                    createdBy,
                    creatorRole
                });

                // Build bill numbers string for description
                const billNumbers = (setOffResult.billsSetOff || []).map(b => b.billNumber).join(", ");
                const setOffDesc = setOffResult.billsSetOff && setOffResult.billsSetOff.length > 0
                    ? `${finalDescription || "Payment"} - Set off: ${billNumbers}`
                    : finalDescription || "Payment - No open bills to set off";

                const entry = new LedgerEntry({
                    _id: bankTxId,
                    branch: resolvedBranchId || branchId || undefined,
                    accountingCode: accCodeId,
                    type: typeVal,
                    amount: amountVal,
                    description: setOffDesc,
                    entryDate: finalEntryDate,
                    transactionId: transactionIdVal,
                    runningBalance: balanceAccum,
                    contact: supplierDoc._id,
                    contactModel: "Supplier",
                    bankTxType: "VENDOR",
                    bills: (setOffResult.billsSetOff || []).map(b => ({
                        billId: b.billId,
                        billNumber: b.billNumber,
                        amountApplied: b.amountApplied
                    })),
                    setOffSummary: {
                        totalSetOff: setOffResult.totalSetOff,
                        billCount: (setOffResult.billsSetOff || []).length,
                        excessAmount: setOffResult.excessAmount
                    },
                    createdBy,
                    creatorRole
                });
                await entry.save();
                createdEntries.push(entry);

                // Track set-off results for response
                setOffResults.push({
                    transactionId: transactionIdVal,
                    supplierName: supplierDoc.name || supplierDoc.companyName,
                    amount: amountVal,
                    ...setOffResult
                });

                continue;
            }

            // If sub-account, parent-account, or customer/supplier without auto set-off is specified, perform double-entry booking
            if ((accountsNameVal && String(accountsNameVal).trim()) || (parentAccountVal && String(parentAccountVal).trim()) || customerDoc || supplierDoc) {
                if (typeVal === "DEBIT") {
                    balanceAccum = isCreditCard ? (balanceAccum - amountVal) : (balanceAccum + amountVal);
                    debitAccum += amountVal;
                } else if (typeVal === "CREDIT") {
                    balanceAccum = isCreditCard ? (balanceAccum + amountVal) : (balanceAccum - amountVal);
                    creditAccum += amountVal;
                }

                const { ensureSubAccountingCode, syncAccountingCodeBalances } = require("../Service/BankAccountService");

                // Determine target account name from ACCOUNTS NAME, or fallback to Accounts Receivable for customer / Accounts Payable for supplier
                const targetAccountName = (accountsNameVal && String(accountsNameVal).trim())
                    ? accountsNameVal
                    : (customerDoc ? "Accounts Receivable" : (supplierDoc ? "Accounts Payable" : ""));

                const subDoc = await ensureSubAccountingCode(
                    parentAccountVal,
                    targetAccountName,
                    createdBy,
                    creatorRole,
                    supplierDoc
                );

                if (subDoc) {
                    const BankAccount = require("../Model/BankAccountModel");
                    const isTargetBankAccount = Boolean(await BankAccount.exists({ accountingCode: subDoc._id, isDeleted: { $ne: true } }));

                    let uploadTxType = "NON_DRIVER_CUSTOMER";
                    if (isTargetBankAccount) {
                        uploadTxType = "INTER_BANK";
                    } else if (supplierDoc) {
                        uploadTxType = "VENDOR";
                    } else if (customerDoc) {
                        uploadTxType = isDriver ? "DRIVER" : "NON_DRIVER_CUSTOMER";
                    }

                    const entry = new LedgerEntry({
                        branch: resolvedBranchId || branchId || undefined,
                        accountingCode: accCodeId,
                        type: typeVal,
                        amount: amountVal,
                        description: finalDescription || "Bulk uploaded double-entry transaction",
                        entryDate: finalEntryDate,
                        transactionId: transactionIdVal,
                        runningBalance: balanceAccum,
                        contact: customerDoc ? customerDoc._id : (supplierDoc ? supplierDoc._id : undefined),
                        contactModel: customerDoc ? "Customer" : (supplierDoc ? "Supplier" : undefined),
                        bankTxType: uploadTxType,
                        createdBy,
                        creatorRole
                    });
                    await entry.save();

                    const offsetEntry = new LedgerEntry({
                        branch: resolvedBranchId || branchId || undefined,
                        accountingCode: subDoc._id,
                        type: typeVal === "DEBIT" ? "CREDIT" : "DEBIT",
                        amount: amountVal,
                        description: finalDescription || "Bulk uploaded double-entry offset",
                        entryDate: finalEntryDate,
                        transactionId: transactionIdVal,
                        contact: customerDoc ? customerDoc._id : (supplierDoc ? supplierDoc._id : undefined),
                        contactModel: customerDoc ? "Customer" : (supplierDoc ? "Supplier" : undefined),
                        bankTxType: uploadTxType,
                        createdBy,
                        creatorRole
                    });
                    await offsetEntry.save();

                    createdEntries.push(entry);

                    // Trigger balance sync for sub-account immediately
                    await syncAccountingCodeBalances(subDoc._id);

                    // If it's a customer receipt and offset account is Accounts Receivable, create PaymentReceived record so it maps under /customers/:id
                    if (customerDoc && typeVal === "DEBIT") {
                        const isAr = (subDoc.code === "1.1.03" || subDoc.code === "1.0.03" || /Accounts Receivable|Cuenta por Cobrar/i.test(subDoc.name) || /Accounts Receivable/i.test(accountsNameVal || ''));
                        if (isAr) {
                            try {
                                const PaymentReceived = require("../../PaymentReceived/Model/PaymentReceivedModel");
                                const prData = {
                                    paymentNumber: `PR-BANK-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
                                    customerId: customerDoc._id,
                                    driverId: customerDoc.driver || undefined,
                                    amountReceived: amountVal,
                                    paymentDate: finalEntryDate,
                                    paymentMethod: "Bank Transfer",
                                    referenceNumber: transactionIdVal || undefined,
                                    notes: finalDescription || `Customer Bank Receipt (${customerDoc.name})`,
                                    depositedTo: accCodeId,
                                    branch: resolvedBranchId || branchId || undefined,
                                    invoices: [],
                                    status: "COMPLETED",
                                    createdBy,
                                    creatorRole
                                };
                                await PaymentReceived.create(prData);
                            } catch (prErr) {
                                console.error("Error creating PaymentReceived for customer bank deposit:", prErr);
                            }
                        }
                    }

                    continue;
                }
            }

            if (typeVal === "DEBIT") {
                balanceAccum = isCreditCard ? (balanceAccum - amountVal) : (balanceAccum + amountVal);
                debitAccum += amountVal;
            } else if (typeVal === "CREDIT") {
                balanceAccum = isCreditCard ? (balanceAccum + amountVal) : (balanceAccum - amountVal);
                creditAccum += amountVal;
            }

            const targetOffsetCodeId = supplierDoc
                ? (apCodeDoc ? apCodeDoc._id : accCodeId)
                : (arCodeDoc ? arCodeDoc._id : accCodeId);

            const contactId = customerDoc ? customerDoc._id : (supplierDoc ? supplierDoc._id : undefined);
            const contactModel = customerDoc ? "Customer" : (supplierDoc ? "Supplier" : undefined);

            const entry = new LedgerEntry({
                branch: resolvedBranchId || branchId || undefined,
                accountingCode: accCodeId,
                type: typeVal,
                amount: amountVal,
                description: finalDescription || "Bulk uploaded ledger transaction",
                entryDate: finalEntryDate,
                transactionId: transactionIdVal,
                runningBalance: balanceAccum,
                contact: contactId,
                contactModel: contactModel,
                createdBy,
                creatorRole
            });
            await entry.save();

            const offsetEntry = new LedgerEntry({
                branch: resolvedBranchId || branchId || undefined,
                accountingCode: targetOffsetCodeId,
                type: typeVal === "DEBIT" ? "CREDIT" : "DEBIT",
                amount: amountVal,
                description: finalDescription || "Bulk uploaded ledger transaction offset",
                entryDate: finalEntryDate,
                transactionId: transactionIdVal,
                contact: contactId,
                contactModel: contactModel,
                createdBy,
                creatorRole
            });
            await offsetEntry.save();

            createdEntries.push(entry);
        }

        const { recalculateRunningBalances, syncAccountingCodeBalances } = require("../Service/BankAccountService");

        // Recalculate running balances for the bank account
        await recalculateRunningBalances(id);

        // Sync and update the bank's accounting code totals and currentBalance
        await syncAccountingCodeBalances(accCodeId);

        // Fetch updated bank account to return correct balance
        const updatedAccount = await BankAccount.findById(id);

        const totalSetOffCount = setOffResults.reduce((sum, r) => {
            if (!r) return sum;
            const invCount = Array.isArray(r.invoicesSetOff) ? r.invoicesSetOff.length : 0;
            const billCount = Array.isArray(r.billsSetOff) ? r.billsSetOff.length : 0;
            return sum + invCount + billCount;
        }, 0);

        res.status(200).json({
            success: true,
            message: `Successfully processed ${createdEntries.length} bulk entries. New current balance is ${updatedAccount.currentBalance}.${setOffResults.length > 0 ? ` Auto set-off applied to ${totalSetOffCount} document(s).` : ''}`,
            data: {
                count: createdEntries.length,
                newBalance: updatedAccount.currentBalance,
                setOffResults: setOffResults.length > 0 ? setOffResults : undefined
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
                const startD = new Date(startDate);
                startD.setHours(0, 0, 0, 0);
                query.entryDate.$gte = startD;
            }
            if (endDate) {
                const endD = new Date(endDate);
                endD.setHours(23, 59, 59, 999);
                query.entryDate.$lte = endD;
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

        // Gather all manualJournal IDs
        const manualJournalIds = transactions
            .map(tx => tx.manualJournal)
            .filter(mjId => mjId !== undefined && mjId !== null);

        let partnerEntriesMap = {};
        if (manualJournalIds.length > 0) {
            const partnerEntries = await LedgerEntry.find({ manualJournal: { $in: manualJournalIds } })
                .populate({
                    path: "accountingCode",
                    populate: {
                        path: "parentAccount"
                    }
                });

            // Group by manualJournal ID
            partnerEntries.forEach(entry => {
                if (entry.manualJournal) {
                    const mjIdStr = entry.manualJournal.toString();
                    if (!partnerEntriesMap[mjIdStr]) {
                        partnerEntriesMap[mjIdStr] = [];
                    }
                    partnerEntriesMap[mjIdStr].push(entry);
                }
            });
        }

        // Fetch corresponding BankTransactions to enrich customer & invoice details
        const BankTransaction = require("../Model/BankTransactionModel");
        const txIds = transactions.map(tx => tx.transactionId).filter(Boolean);

        // Build fallback OR conditions for matching by date, amount, type in case transactionId is missing
        const fallbackOrConditions = transactions.map(tx => {
            const dateStart = new Date(tx.entryDate);
            dateStart.setMinutes(dateStart.getMinutes() - 1);
            const dateEnd = new Date(tx.entryDate);
            dateEnd.setMinutes(dateEnd.getMinutes() + 1);

            return {
                amount: tx.amount,
                type: tx.type,
                entryDate: { $gte: dateStart, $lte: dateEnd }
            };
        });

        const btOrConditions = [];
        if (txIds.length > 0) {
            btOrConditions.push({ transactionId: { $in: txIds } });
        }
        if (fallbackOrConditions.length > 0) {
            btOrConditions.push(...fallbackOrConditions);
        }

        let bankTransactions = [];
        if (btOrConditions.length > 0) {
            bankTransactions = await BankTransaction.find({
                bankAccount: id,
                $or: btOrConditions
            });
        }

        const findBankTx = (tx) => {
            if (tx.transactionId) {
                const match = bankTransactions.find(bt => bt.transactionId === tx.transactionId);
                if (match) return match;
            }
            return bankTransactions.find(bt =>
                Math.abs(bt.amount - tx.amount) < 0.01 &&
                bt.type === tx.type &&
                Math.abs(new Date(bt.entryDate).getTime() - new Date(tx.entryDate).getTime()) < 60000
            );
        };

        const InvoiceSetOffHistory = require("../Model/InvoiceBillSetOffHistoryModel");
        const Customer = require("../../Customer/Model/CustomerModel");
        const Supplier = require("../../Supplier/Model/SupplierModel");

        const contactIds = transactions.map(t => t.contact).filter(Boolean);
        const [customersList, suppliersList, setOffHistories] = await Promise.all([
            Customer.find({ _id: { $in: contactIds } }, "name companyName displayName").lean(),
            Supplier.find({ _id: { $in: contactIds } }, "name companyName displayName").lean(),
            InvoiceSetOffHistory.find({
                $or: [
                    { primaryLedgerEntry: { $in: transactions.map(t => t._id) } },
                    { bankTransaction: { $in: transactions.map(t => t._id) } },
                    { ledgerJournal: { $in: manualJournalIds } },
                    { transactionId: { $in: txIds } }
                ]
            }).populate("customer", "name companyName displayName").populate("supplier", "name companyName displayName").lean()
        ]);

        const customerMap = new Map(customersList.map(c => [String(c._id), c.name || c.companyName || c.displayName || ""]));
        const supplierMap = new Map(suppliersList.map(s => [String(s._id), s.name || s.companyName || s.displayName || ""]));

        // Map transactions to mimic LedgerEntry fields for frontend compatibility
        const mappedTransactions = transactions.map(tx => {
            const obj = tx.toObject();
            obj.date = tx.entryDate;
            obj.referenceId = tx.transactionId; // mapping transactionId to referenceId
            obj.bankAccount = account._id;
            obj.bankAccountName = account.accountName || account.bankName;
            obj.bankAccountingCode = account.accountingCode;

            // Enrich contact name directly from contact ID
            if (tx.contact) {
                const contactIdStr = String(tx.contact._id || tx.contact);
                if (supplierMap.has(contactIdStr)) {
                    obj.contactModel = "Supplier";
                    obj.supplier = contactIdStr;
                    obj.supplierName = supplierMap.get(contactIdStr);
                    obj.contactName = supplierMap.get(contactIdStr);
                } else if (customerMap.has(contactIdStr)) {
                    obj.contactModel = "Customer";
                    obj.customer = contactIdStr;
                    obj.customerName = customerMap.get(contactIdStr);
                    obj.contactName = customerMap.get(contactIdStr);
                }
            }

            // Enrich customer, invoice, and offset accounting code if matching BankTransaction exists
            const bt = findBankTx(tx);
            if (bt) {
                obj.customer = bt.customer || obj.customer;
                obj.customerName = bt.customerName || obj.customerName;
                obj.invoice = bt.invoice || obj.invoice;
                obj.invoices = (bt.invoices && bt.invoices.length > 0) ? bt.invoices : obj.invoices;
                obj.bills = (bt.bills && bt.bills.length > 0) ? bt.bills : obj.bills;
                obj.setOffSummary = bt.setOffSummary || obj.setOffSummary;
            }

            // Enrich from InvoiceSetOffHistory
            const history = setOffHistories.find(h =>
                (h.primaryLedgerEntry && String(h.primaryLedgerEntry) === String(tx._id)) ||
                (h.bankTransaction && String(h.bankTransaction) === String(tx._id)) ||
                (h.ledgerJournal && String(h.ledgerJournal) === String(tx.manualJournal)) ||
                (tx.transactionId && h.transactionId && String(h.transactionId) === String(tx.transactionId))
            );

            if (history) {
                if (history.targetType === "SUPPLIER" || history.supplier) {
                    obj.contactModel = "Supplier";
                    obj.supplier = history.supplier?._id || history.supplier;
                    const supName = typeof history.supplier === "object" && history.supplier
                        ? (history.supplier.name || history.supplier.companyName || history.supplier.displayName)
                        : "";
                    if (supName) {
                        obj.supplierName = supName;
                        obj.contactName = supName;
                    }
                    if (!obj.bills || obj.bills.length === 0) {
                        obj.bills = (history.billSnapshots || []).map(snap => ({
                            billId: snap.bill,
                            billNumber: snap.billNumber,
                            amountApplied: snap.amountApplied,
                            paymentId: snap.paymentId
                        }));
                    }
                    if (!obj.setOffSummary) {
                        obj.setOffSummary = {
                            totalSetOff: (history.billSnapshots || []).reduce((acc, s) => acc + (s.amountApplied || 0), 0),
                            billCount: (history.billSnapshots || []).length,
                            bills: (history.billSnapshots || []).map(snap => ({
                                billId: snap.bill,
                                billNumber: snap.billNumber,
                                amountApplied: snap.amountApplied,
                                paymentId: snap.paymentId
                            })),
                            excessAmount: history.excessAmount || 0
                        };
                    }
                } else {
                    obj.contactModel = "Customer";
                    obj.customer = history.customer?._id || history.customer;
                    const custName = typeof history.customer === "object" && history.customer
                        ? (history.customer.name || history.customer.companyName || history.customer.displayName)
                        : "";
                    if (custName) {
                        obj.customerName = custName;
                        obj.contactName = custName;
                    }
                    if (!obj.invoices || obj.invoices.length === 0) {
                        obj.invoices = (history.invoiceSnapshots || []).map(snap => ({
                            invoiceId: snap.invoice,
                            invoiceNumber: snap.invoiceNumber,
                            amountApplied: snap.amountApplied,
                            paymentId: snap.paymentId
                        }));
                    }
                    if (!obj.setOffSummary) {
                        obj.setOffSummary = {
                            totalSetOff: (history.invoiceSnapshots || []).reduce((acc, s) => acc + (s.amountApplied || 0), 0),
                            invoiceCount: (history.invoiceSnapshots || []).length,
                            invoices: (history.invoiceSnapshots || []).map(snap => ({
                                invoiceId: snap.invoice,
                                invoiceNumber: snap.invoiceNumber,
                                amountApplied: snap.amountApplied,
                                paymentId: snap.paymentId
                            })),
                            excessAmount: history.excessAmount || 0
                        };
                    }
                }
            }

            // Find partner accounting code name if double-entry is present
            if (tx.manualJournal && partnerEntriesMap[tx.manualJournal.toString()]) {
                const journalLegs = partnerEntriesMap[tx.manualJournal.toString()];
                // The partner leg is the one that DOES NOT have the bank account's accountingCode
                const partnerEntry = journalLegs.find(e =>
                    e.accountingCode && e.accountingCode._id.toString() !== account.accountingCode.toString()
                );
                if (partnerEntry && partnerEntry.accountingCode) {
                    obj.offsetAccountingCode = partnerEntry.accountingCode._id;
                    obj.offsetAccountName = partnerEntry.accountingCode.name;
                    if (partnerEntry.accountingCode.parentAccount) {
                        obj.accountsName = partnerEntry.accountingCode.name;
                        obj.parentAccount = typeof partnerEntry.accountingCode.parentAccount === 'object'
                            ? partnerEntry.accountingCode.parentAccount.name
                            : partnerEntry.accountingCode.parentAccount;
                    } else {
                        obj.accountsName = "";
                        obj.parentAccount = partnerEntry.accountingCode.name;
                    }
                }
            }
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
                openingBalance = (account.initialBalance || 0) + (isCreditCard
                    ? (priorCredits - priorDebits)
                    : (priorDebits - priorCredits));
            }
        }

        const isCreditCard = account.accountType === "Credit Card";
        const closingBalance = isCreditCard
            ? openingBalance + totalWithdrawals - totalDeposits
            : openingBalance + totalDeposits - totalWithdrawals;

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
            openingBalance,
            closingBalance
        });
    } catch (error) {
        console.error("Error in getBankTransactions controller:", error);
        next(error);
    }
};

exports.getBankTransactionById = async (req, res, next) => {
    try {
        const { transactionId } = req.params;
        const mongoose = require("mongoose");
        const LedgerEntry = require("../../Ledger/Model/LedgerEntryModel");
        const InvoiceBillSetOffHistory = require("../Model/InvoiceBillSetOffHistoryModel");
        const BankAccount = require("../Model/BankAccountModel");

        let ledgerEntry = null;

        if (mongoose.Types.ObjectId.isValid(transactionId)) {
            ledgerEntry = await LedgerEntry.findById(transactionId)
                .populate("branch", "name code")
                .populate("accountingCode", "code name category")
                .populate("createdBy", "name email")
                .populate("contact", "name customerId")
                .populate("supplier", "name supplierId");
        }

        if (!ledgerEntry) {
            ledgerEntry = await LedgerEntry.findOne({ transactionId: String(transactionId) })
                .populate("branch", "name code")
                .populate("accountingCode", "code name category")
                .populate("createdBy", "name email")
                .populate("contact", "name customerId")
                .populate("supplier", "name supplierId");
        }

        if (!ledgerEntry) {
            return res.status(404).json({ success: false, message: "Bank transaction not found" });
        }

        const transactionObj = ledgerEntry.toObject();
        const searchTxId = ledgerEntry.transactionId || String(transactionId);

        if (ledgerEntry.accountingCode) {
            const matchedAccount = await BankAccount.findOne({ accountingCode: ledgerEntry.accountingCode._id || ledgerEntry.accountingCode, isDeleted: false });
            transactionObj.bankAccount = matchedAccount ? {
                _id: matchedAccount._id,
                accountName: matchedAccount.accountName || matchedAccount.bankName,
                bankName: matchedAccount.bankName,
                accountNumber: matchedAccount.accountNumber,
                currency: matchedAccount.currency,
                status: matchedAccount.status
            } : null;
        }

        // Fetch set-off history if available
        const searchConditions = [
            { primaryLedgerEntry: ledgerEntry._id },
            { partnerLedgerEntries: ledgerEntry._id },
        ];
        if (searchTxId) {
            searchConditions.push({ transactionId: String(searchTxId) });
        }

        const historyDoc = await InvoiceBillSetOffHistory.findOne({ $or: searchConditions })
            .populate("customer", "name customerId")
            .populate("supplier", "name supplierId")
            .populate("paymentReceived", "paymentNumber amountReceived")
            .populate("vendorPayment", "paymentNumber amount");

        transactionObj.setOffHistory = historyDoc || null;

        // Collect all connected double-entry ledger entries (Both Credit & Debit legs)
        const connectedConditions = [];

        if (ledgerEntry.manualJournal) {
            connectedConditions.push({ manualJournal: ledgerEntry.manualJournal });
        }
        if (searchTxId) {
            connectedConditions.push({ transactionId: String(searchTxId) });
        }
        if (historyDoc && historyDoc.partnerLedgerEntries && historyDoc.partnerLedgerEntries.length > 0) {
            connectedConditions.push({ _id: { $in: historyDoc.partnerLedgerEntries } });
        }
        connectedConditions.push({ _id: ledgerEntry._id });

        let connectedLedgerEntries = [];
        if (connectedConditions.length > 0) {
            connectedLedgerEntries = await LedgerEntry.find({ $or: connectedConditions })
                .populate("accountingCode", "code name category accountType")
                .populate("contact", "name customerId")
                .populate("supplier", "name supplierId")
                .sort({ type: -1, createdAt: 1 });
        }
        transactionObj.connectedLedgerEntries = connectedLedgerEntries;

        // Determine transaction classification
        let detectedType = ledgerEntry.bankTxType || "NON_DRIVER_CUSTOMER";

        if (!ledgerEntry.bankTxType) {
            const hasSupplier = Boolean(
                ledgerEntry.supplier ||
                ledgerEntry.contactModel === "Supplier" ||
                (historyDoc && historyDoc.targetType === "SUPPLIER") ||
                connectedLedgerEntries.some(e => e.supplier || e.contactModel === "Supplier")
            );

        // Check if partner leg belongs to another Bank Account (Inter-Bank Transfer)
        const allBankAccounts = await BankAccount.find({ isDeleted: { $ne: true } });
        const bankAccountingCodeIds = new Set(allBankAccounts.map(b => String(b.accountingCode)));

        const primaryCodeId = String(ledgerEntry.accountingCode?._id || ledgerEntry.accountingCode || '');

        const isInterBank = connectedLedgerEntries.some(lEntry => {
            const codeId = String(lEntry.accountingCode?._id || lEntry.accountingCode || '');
            const accType = lEntry.accountingCode?.accountType;
            return codeId !== primaryCodeId && (bankAccountingCodeIds.has(codeId) || accType === "Bank" || accType === "Cash");
        }) || (ledgerEntry.description && /inter-bank|transfer.*bank|transferencia.*banco/i.test(ledgerEntry.description));

        if (isInterBank) {
            detectedType = "INTER_BANK";
        } else if (hasSupplier) {
            detectedType = "VENDOR";
        } else {
            // Check if Customer is Driver
            const Customer = require("../../Customer/Model/CustomerModel");
            let isDriver = false;

            const contactId = ledgerEntry.contact?._id || ledgerEntry.contact;
            if (contactId) {
                const custDoc = await Customer.findById(contactId);
                if (custDoc && (custDoc.driver || custDoc.driverId || custDoc.isDriver)) {
                    isDriver = true;
                }
            }
            if (historyDoc && historyDoc.targetType === "CUSTOMER") {
                isDriver = true;
            }
            if (ledgerEntry.description && /driver|conductor|chofer/i.test(ledgerEntry.description)) {
                isDriver = true;
            }

            if (isDriver) {
                detectedType = "DRIVER";
            } else if (contactId || ledgerEntry.contactModel === "Customer") {
                detectedType = "NON_DRIVER_CUSTOMER";
            } else {
                detectedType = ledgerEntry.type === "CREDIT" ? "VENDOR" : "DRIVER";
            }
        }
    }

    transactionObj.detectedType = detectedType;

        res.status(200).json({
            success: true,
            data: transactionObj
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

exports.changeCustomerTransactionAmount = async (req, res, next) => {
    try {
        const { transactionId } = req.params;
        const { amount, notes, entryDate } = req.body;

        if (amount === undefined || isNaN(Number(amount)) || Number(amount) <= 0) {
            return res.status(400).json({ success: false, message: "Valid positive amount is required" });
        }

        const options = {
            createdBy: req.user?._id,
            creatorRole: req.user?.role,
            description: notes,
            entryDate: entryDate ? new Date(entryDate) : undefined
        };

        const result = await BankAccountService.updateCustomerTransactionAmount(transactionId, amount, options);

        res.status(200).json({
            success: true,
            message: "Successfully updated customer transaction amount and set-off history",
            data: result
        });
    } catch (error) {
        console.error("Error in changeCustomerTransactionAmount controller:", error);
        next(error);
    }
};

exports.changeCustomerContact = async (req, res, next) => {
    try {
        const { transactionId } = req.params;
        const { newCustomerId } = req.body;

        const options = {
            createdBy: req.user?._id,
            creatorRole: req.user?.role
        };

        const result = await BankAccountService.updateCustomerContact(transactionId, newCustomerId, options);

        res.status(200).json({
            success: true,
            message: "Successfully updated customer contact and re-applied set-off",
            data: result
        });
    } catch (error) {
        console.error("Error in changeCustomerContact controller:", error);
        next(error);
    }
};

exports.changeVendorTransactionAmount = async (req, res, next) => {
    try {
        const { transactionId } = req.params;
        const { amount, notes, entryDate } = req.body;

        if (amount === undefined || isNaN(Number(amount)) || Number(amount) <= 0) {
            return res.status(400).json({ success: false, message: "Valid positive amount is required" });
        }

        const options = {
            createdBy: req.user?._id,
            creatorRole: req.user?.role,
            description: notes,
            entryDate: entryDate ? new Date(entryDate) : undefined
        };

        const result = await BankAccountService.updateVendorTransactionAmount(transactionId, amount, options);

        res.status(200).json({
            success: true,
            message: "Successfully updated vendor transaction amount and bill set-off history",
            data: result
        });
    } catch (error) {
        console.error("Error in changeVendorTransactionAmount controller:", error);
        next(error);
    }
};

exports.changeVendorContact = async (req, res, next) => {
    try {
        const { transactionId } = req.params;
        const { newSupplierId } = req.body;

        const options = {
            createdBy: req.user?._id,
            creatorRole: req.user?.role
        };

        const result = await BankAccountService.updateVendorContact(transactionId, newSupplierId, options);

        res.status(200).json({
            success: true,
            message: "Successfully updated vendor contact and re-applied bill set-off",
            data: result
        });
    } catch (error) {
        console.error("Error in changeVendorContact controller:", error);
        next(error);
    }
};
