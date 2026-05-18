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
            if (startDate) query.expenseDate.$gte = new Date(startDate);
            if (endDate) query.expenseDate.$lte = new Date(endDate);
        } else if (!search && !hasBranch && !hasSupplier && !hasCustomer) {
            // NO SEARCH, NO CUSTOM DATES, NO OTHER FILTERS -> default to last 1 month
            const oneMonthAgo = new Date();
            oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
            query.expenseDate = { $gte: oneMonthAgo };
            console.log(`[ExpenseController] No active filters. Defaulting to last 1 month of expenses (>= ${oneMonthAgo.toISOString().split("T")[0]}).`);
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
            .sort({ expenseDate: -1, createdAt: -1 })
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
