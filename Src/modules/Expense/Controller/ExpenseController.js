const Expense = require("../Model/ExpenseModel");
const LedgerService = require("../../Ledger/Service/LedgerService");
const AppError = require("../../../shared/utils/AppError");

exports.createExpense = async (req, res, next) => {
    try {
        const userData = req.user || {};
        const { expenseAccount, paidThroughAccount, amount, branch, ...extra } = req.body;

        if (!expenseAccount || !paidThroughAccount || !amount || !branch) {
            return res.status(400).json({
                success: false,
                message: "Expense Account, Paid Through Account, Branch, and Amount are required fields."
            });
        }

        const expenseNumber = req.body.expenseNumber || `EXP-${Date.now()}`;
        const newExpense = new Expense({
            ...extra,
            expenseNumber,
            expenseAccount,
            paidThroughAccount,
            amount: Number(amount),
            branch,
            createdBy: userData.id || userData._id || "6a08a05164d54b825845b5d3", // Seeder fallback
            creatorRole: userData.role || "FINANCEADMIN"
        });

        const savedExpense = await newExpense.save();

        console.log(`[ExpenseController] Expense saved: ${savedExpense.expenseNumber}. Posting to Ledger...`);

        // Post Double-Entry Ledger Transactions
        try {
            // Fetch populated code names for description context
            const AccountingCode = require("../../AccountingCode/Model/AccountingCodeModel");
            const [debAccount, credAccount] = await Promise.all([
                AccountingCode.findById(expenseAccount),
                AccountingCode.findById(paidThroughAccount)
            ]);

            const debName = debAccount ? debAccount.name : "Expense Account";
            const credName = credAccount ? credAccount.name : "Asset Account";

            // Leg 1: DEBIT the Expense Account (increases expense asset/charge)
            await LedgerService.create({
                branch,
                accountingCode: expenseAccount,
                type: "DEBIT",
                amount: savedExpense.amount,
                description: `Expense ${savedExpense.expenseNumber} - Debit ${debName}. Notes: ${savedExpense.notes || "Immediate Expense"}`,
                entryDate: savedExpense.expenseDate,
                createdBy: savedExpense.createdBy,
                creatorRole: savedExpense.creatorRole
            });

            // Leg 2: CREDIT the Paid Through Account (decreases Cash/Bank asset)
            await LedgerService.create({
                branch,
                accountingCode: paidThroughAccount,
                type: "CREDIT",
                amount: savedExpense.amount,
                description: `Expense ${savedExpense.expenseNumber} - Credit ${credName} (Paid Through). Notes: ${savedExpense.notes || "Immediate Expense"}`,
                entryDate: savedExpense.expenseDate,
                createdBy: savedExpense.createdBy,
                creatorRole: savedExpense.creatorRole
            });

            console.log(`[ExpenseController] Ledger entries successfully recorded for: ${savedExpense.expenseNumber}`);
        } catch (ledgError) {
            console.error(`[ExpenseController] Failed to auto-generate ledger entries for: ${savedExpense.expenseNumber}`, ledgError);
        }

        res.status(201).json({
            success: true,
            message: "Expense registered and ledger double-entry successfully posted.",
            data: savedExpense
        });

    } catch (error) {
        if (next) next(error);
        else res.status(500).json({ success: false, message: error.message });
    }
};

exports.getAllExpenses = async (req, res, next) => {
    try {
        const query = {};
        
        // ── Smart Date Filter (1 Month Default) ──────────────────────────────
        const startDate = req.query.startDate;
        const endDate = req.query.endDate;
        const search = req.query.search;
        const hasBranch = req.query.branch && req.query.branch !== "ALL";
        const hasSupplier = req.query.supplier && req.query.supplier !== "ALL";
        const hasCustomer = req.query.customer && req.query.customer !== "ALL";

        if (startDate || endDate) {
            // User adjusted custom dates -> apply custom range
            query.expenseDate = {};
            if (startDate) {
                query.expenseDate.$gte = new Date(startDate);
            }
            if (endDate) {
                const end = new Date(endDate);
                end.setHours(23, 59, 59, 999);
                query.expenseDate.$lte = end;
            }
        }

        // Apply filters
        if (req.query.branch && req.query.branch !== "ALL") query.branch = req.query.branch;
        if (req.query.supplier && req.query.supplier !== "ALL") query.supplier = req.query.supplier;
        if (req.query.customer && req.query.customer !== "ALL") query.customer = req.query.customer;

        if (search) {
            const regex = new RegExp(search, "i");
            query.$or = [
                { expenseNumber: regex },
                { notes: regex }
            ];
        }

        // ── Pagination ───────────────────────────────────────────────────────
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 25;
        const skip = (page - 1) * limit;

        const total = await Expense.countDocuments(query);
        const docs = await Expense.find(query)
            .populate("expenseAccount")
            .populate("paidThroughAccount")
            .populate("supplier")
            .populate("customer")
            .populate("branch")
            .sort({ createdAt: 1 })
            .skip(skip)
            .limit(limit);

        res.status(200).json({
            success: true,
            data: docs,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        if (next) next(error);
        else res.status(500).json({ success: false, message: error.message });
    }
};

exports.getExpenseById = async (req, res, next) => {
    try {
        const doc = await Expense.findById(req.params.id)
            .populate("expenseAccount")
            .populate("paidThroughAccount")
            .populate("supplier")
            .populate("customer")
            .populate("branch");

        if (!doc) {
            return res.status(404).json({ success: false, message: "Expense not found" });
        }
        res.status(200).json({ success: true, data: doc });
    } catch (error) {
        if (next) next(error);
        else res.status(500).json({ success: false, message: error.message });
    }
};

exports.updateExpense = async (req, res, next) => {
    try {
        const updatedDoc = await Expense.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!updatedDoc) {
            return res.status(404).json({ success: false, message: "Expense not found" });
        }
        res.status(200).json({ success: true, data: updatedDoc });
    } catch (error) {
        if (next) next(error);
        else res.status(500).json({ success: false, message: error.message });
    }
};

exports.deleteExpense = async (req, res, next) => {
    try {
        const deletedDoc = await Expense.findByIdAndDelete(req.params.id);
        if (!deletedDoc) {
            return res.status(404).json({ success: false, message: "Expense not found" });
        }
        res.status(200).json({ success: true, message: "Expense deleted successfully" });
    } catch (error) {
        if (next) next(error);
        else res.status(500).json({ success: false, message: error.message });
    }
};

exports.downloadExpensePdf = async (req, res, next) => {
    try {
        const doc = await Expense.findById(req.params.id)
            .populate("expenseAccount")
            .populate("paidThroughAccount")
            .populate("supplier")
            .populate("customer")
            .populate("branch")
            .populate("createdBy", "fullName");

        if (!doc) {
            return res.status(404).json({ success: false, message: "Expense not found" });
        }

        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `inline; filename="Expense-${doc.expenseNumber}.pdf"`);

        const ExpensePdfService = require("../Service/ExpensePdfService");
        ExpensePdfService.generateExpensePdf(doc, res);
    } catch (error) {
        if (next) next(error);
        else res.status(500).json({ success: false, message: error.message });
    }
};

exports.bulkUploadExpenses = async (req, res) => {
    try {
        const rows = req.body.rows || req.body;
        if (!rows || !Array.isArray(rows) || rows.length === 0) {
            return res.status(400).json({ success: false, message: 'No data rows provided.' });
        }

        // ---- Pre-load reference collections ----
        const Supplier = require("../../Supplier/Model/SupplierModel");
        const Branch = require("../../Branch/Model/BranchModel");
        const AccountingCode = require("../../AccountingCode/Model/AccountingCodeModel");

        const suppliersList = await Supplier.find({ isDeleted: false });
        const suppliersByName = new Map();
        const suppliersByNumber = new Map();
        for (const s of suppliersList) {
            if (s.name) suppliersByName.set(s.name.trim().toLowerCase().replace(/\s+/g, ' '), s);
            if (s.vendorNumber) suppliersByNumber.set(s.vendorNumber.trim().toLowerCase(), s);
        }

        const branchesList = await Branch.find({ isDeleted: false });
        const branchesByName = new Map();
        for (const b of branchesList) {
            if (b.name) branchesByName.set(b.name.trim().toLowerCase().replace(/\s+/g, ' '), b);
        }
        const defaultBranch = branchesList.find(b => b.type === "BRANCH" && b.status === "ACTIVE") || branchesList.find(b => b.type === "BRANCH") || branchesList[0];

        const accountsList = await AccountingCode.find({ isDeleted: false });
        const accountsByCode = new Map();
        const accountsByName = new Map();
        for (const acc of accountsList) {
            if (acc.code) accountsByCode.set(acc.code.trim().toLowerCase(), acc);
            if (acc.name) accountsByName.set(acc.name.trim().toLowerCase().replace(/\s+/g, ' '), acc);
        }

        // ---- Utilities ----
        const getRowVal = (r, possibleKeys) => {
            for (const key of possibleKeys) {
                const cleanKey = key.replace(/^\ufeff/, '').trim().toLowerCase();
                if (r[key] !== undefined) return r[key];
                for (const k of Object.keys(r)) {
                    const cleanK = k.replace(/^\ufeff/, '').trim().toLowerCase();
                    if (cleanK === cleanKey) return r[k];
                }
            }
            return undefined;
        };

        const parseFlexibleDate = (dateStr) => {
            if (!dateStr) return null;
            if (dateStr instanceof Date) return isNaN(dateStr.getTime()) ? null : dateStr;
            if (typeof dateStr === 'number') {
                const date = new Date((dateStr - 25569) * 86400 * 1000);
                return isNaN(date.getTime()) ? null : date;
            }
            const str = dateStr.toString().trim();
            if (!str) return null;
            const dmyRegex = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/;
            const match = str.match(dmyRegex);
            if (match) {
                const day = parseInt(match[1], 10);
                const month = parseInt(match[2], 10) - 1;
                const year = parseInt(match[3], 10);
                const date = new Date(year, month, day);
                if (date.getFullYear() === year && date.getMonth() === month && date.getDate() === day) return date;
            }
            const parsedDate = new Date(str);
            return isNaN(parsedDate.getTime()) ? null : parsedDate;
        };

        // ---- Process rows ----
        const created = [];
        const errors = [];
        let baseCount = await Expense.countDocuments();

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const rowIdx = i + 1;

            try {
                // --- Map: Expense Amount (required) ---
                const rawAmount = getRowVal(row, ['Expense Amount', 'expenseAmount', 'Amount', 'amount']);
                const amount = Number(rawAmount);
                if (!rawAmount || isNaN(amount) || amount <= 0) {
                    errors.push(`Row ${rowIdx}: Invalid or missing Expense Amount.`);
                    continue;
                }

                // --- Map: Expense Date -> expenseDate ---
                const rawDate = getRowVal(row, ['Expense Date', 'expenseDate', 'Date', 'date']);
                const expenseDate = parseFlexibleDate(rawDate) || new Date();

                // --- Resolve Expense Account by name or code ---
                const expAccName = getRowVal(row, ['Expense Account', 'expenseAccount']);
                const expAccCode = getRowVal(row, ['Expense Account Code', 'expenseAccountCode']);
                let expenseAccountDoc = null;
                if (expAccCode) {
                    expenseAccountDoc = accountsByCode.get(expAccCode.toString().trim().toLowerCase());
                }
                if (!expenseAccountDoc && expAccName) {
                    const cleanName = expAccName.toString().trim().toLowerCase().replace(/\s+/g, ' ');
                    expenseAccountDoc = accountsByName.get(cleanName);
                    if (!expenseAccountDoc) {
                        const cleanInput = cleanName.replace(/[^a-z0-9\s]/g, '').trim();
                        for (const [dbName, dbAcc] of accountsByName.entries()) {
                            const cleanDb = dbName.replace(/[^a-z0-9\s]/g, '').trim();
                            if (cleanDb === cleanInput || cleanDb.includes(cleanInput) || cleanInput.includes(cleanDb)) {
                                expenseAccountDoc = dbAcc;
                                break;
                            }
                        }
                    }
                }

                // --- Resolve Paid Through Account by name or code ---
                const ptName = getRowVal(row, ['Paid Through', 'paidThrough']);
                const ptCode = getRowVal(row, ['Paid Through Account Code', 'paidThroughAccountCode']);
                let paidThroughDoc = null;
                if (ptCode) {
                    paidThroughDoc = accountsByCode.get(ptCode.toString().trim().toLowerCase());
                }
                if (!paidThroughDoc && ptName) {
                    const cleanName = ptName.toString().trim().toLowerCase().replace(/\s+/g, ' ');
                    paidThroughDoc = accountsByName.get(cleanName);
                    if (!paidThroughDoc) {
                        const cleanInput = cleanName.replace(/[^a-z0-9\s]/g, '').trim();
                        for (const [dbName, dbAcc] of accountsByName.entries()) {
                            const cleanDb = dbName.replace(/[^a-z0-9\s]/g, '').trim();
                            if (cleanDb === cleanInput || cleanDb.includes(cleanInput) || cleanInput.includes(cleanDb)) {
                                paidThroughDoc = dbAcc;
                                break;
                            }
                        }
                    }
                }

                // --- Resolve Supplier via Vendor / Vendor Number ---
                const vendorName = getRowVal(row, ['Vendor', 'vendor', 'Vendor Name', 'vendorName']);
                const vendorNumber = getRowVal(row, ['Vendor Number', 'vendorNumber']);
                let supplierDoc = null;
                if (vendorName) {
                    const cleanName = vendorName.toString().trim().toLowerCase().replace(/\s+/g, ' ');
                    supplierDoc = suppliersByName.get(cleanName);
                    if (!supplierDoc) {
                        for (const [dbName, dbSup] of suppliersByName.entries()) {
                            const cleanDb = dbName.replace(/[^a-z0-9\s]/g, '').trim();
                            const cleanInput = cleanName.replace(/[^a-z0-9\s]/g, '').trim();
                            if (cleanDb === cleanInput || cleanDb.includes(cleanInput) || cleanInput.includes(cleanDb)) {
                                supplierDoc = dbSup;
                                break;
                            }
                        }
                    }
                }
                if (!supplierDoc && vendorNumber) {
                    supplierDoc = suppliersByNumber.get(vendorNumber.toString().trim().toLowerCase());
                }

                // --- Resolve Branch via Location Name ---
                const locationName = getRowVal(row, ['Location Name', 'locationName', 'Location', 'location']);
                let branchDoc = null;
                if (locationName) {
                    branchDoc = branchesByName.get(locationName.toString().trim().toLowerCase().replace(/\s+/g, ' '));
                }

                if (!branchDoc || branchDoc.type === "WORKSHOP") {
                    branchDoc = defaultBranch;
                }

                // --- Collect ALL unmapped fields into notes ---
                const unmappedFields = {
                    'Expense Description': getRowVal(row, ['Expense Description', 'expenseDescription', 'Description', 'description']),
                    'Entry Number': getRowVal(row, ['Entry Number', 'entryNumber']),
                    'Currency Code': getRowVal(row, ['Currency Code', 'currencyCode']),
                    'Exchange Rate': getRowVal(row, ['Exchange Rate', 'exchangeRate']),
                    'Is Inclusive Tax': getRowVal(row, ['Is Inclusive Tax', 'isInclusiveTax']),
                    'Mileage Rate': getRowVal(row, ['Mileage Rate', 'mileageRate']),
                    'Mileage Type': getRowVal(row, ['Mileage Type', 'mileageType']),
                    'Tax Type': getRowVal(row, ['Tax Type', 'taxType']),
                    'Tax Amount': getRowVal(row, ['Tax Amount', 'taxAmount']),
                    'Total': getRowVal(row, ['Total', 'total']),
                    'Is Billable': getRowVal(row, ['Is Billable', 'isBillable']),
                    'Expense Reference ID': getRowVal(row, ['Expense Reference ID', 'expenseReferenceId']),
                    'Is Reimbursable': getRowVal(row, ['Is Reimbursable', 'isReimbursable']),
                    'Project Name': getRowVal(row, ['Project Name', 'projectName']),
                };

                // If supplier unresolved, capture vendor info in notes
                if (!supplierDoc) {
                    if (vendorName) unmappedFields['Vendor (Unresolved)'] = vendorName;
                    if (vendorNumber) unmappedFields['Vendor Number (Unresolved)'] = vendorNumber;
                }
                // If accounts unresolved, capture in notes
                if (!expenseAccountDoc) {
                    if (expAccName) unmappedFields['Expense Account (Unresolved)'] = expAccName;
                    if (expAccCode) unmappedFields['Expense Account Code (Unresolved)'] = expAccCode;
                }
                if (!paidThroughDoc) {
                    if (ptName) unmappedFields['Paid Through (Unresolved)'] = ptName;
                    if (ptCode) unmappedFields['Paid Through Code (Unresolved)'] = ptCode;
                }

                const notesParts = [];
                for (const [k, v] of Object.entries(unmappedFields)) {
                    if (v !== undefined && v !== null && v !== '') {
                        notesParts.push(`${k}: ${v}`);
                    }
                }
                const notes = notesParts.length > 0 ? notesParts.join(' | ') : undefined;

                // --- Generate expense number ---
                baseCount++;
                const expenseNumber = `EXP-${String(baseCount).padStart(6, '0')}`;

                // --- Determine creator ---
                const userData = req.user || {};
                const createdBy = userData.id || userData._id || "6a08a05164d54b825845b5d3";
                const creatorRole = userData.role || "FINANCEADMIN";

                // --- Create Expense record ---
                const newDoc = await Expense.create({
                    expenseNumber,
                    expenseAccount: expenseAccountDoc ? expenseAccountDoc._id : undefined,
                    paidThroughAccount: paidThroughDoc ? paidThroughDoc._id : undefined,
                    amount,
                    expenseDate,
                    supplier: supplierDoc ? supplierDoc._id : undefined,
                    branch: branchDoc ? branchDoc._id : undefined,
                    notes,
                    createdBy,
                    creatorRole
                });

                // --- Post Ledger Double-Entry ---
                try {
                    const debName = expenseAccountDoc ? expenseAccountDoc.name : "Expense Account";
                    const credName = paidThroughDoc ? paidThroughDoc.name : "Asset Account";

                    if (expenseAccountDoc) {
                        await LedgerService.create({
                            branch: branchDoc ? branchDoc._id : undefined,
                            accountingCode: expenseAccountDoc._id,
                            type: "DEBIT",
                            amount: newDoc.amount,
                            description: `Expense ${newDoc.expenseNumber} - Debit ${debName}. Notes: ${newDoc.notes || "Bulk Import Expense"}`,
                            entryDate: newDoc.expenseDate,
                            createdBy,
                            creatorRole
                        });
                    }

                    if (paidThroughDoc) {
                        await LedgerService.create({
                            branch: branchDoc ? branchDoc._id : undefined,
                            accountingCode: paidThroughDoc._id,
                            type: "CREDIT",
                            amount: newDoc.amount,
                            description: `Expense ${newDoc.expenseNumber} - Credit ${credName} (Paid Through). Notes: ${newDoc.notes || "Bulk Import Expense"}`,
                            entryDate: newDoc.expenseDate,
                            createdBy,
                            creatorRole
                        });
                    }
                } catch (ledgError) {
                    console.error(`[ExpenseController] Bulk: Failed ledger for ${newDoc.expenseNumber}`, ledgError);
                }

                created.push(newDoc.expenseNumber);
            } catch (err) {
                errors.push(`Row ${rowIdx}: ${err.message}`);
            }
        }

        res.status(200).json({
            success: true,
            data: {
                successCount: created.length,
                errorCount: errors.length,
                errors,
                createdExpenses: created
            }
        });
    } catch (error) {
        console.error('[ExpenseController] Bulk upload error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};
