const LedgerEntry = require("../../Ledger/Model/LedgerEntryModel");
const AccountingCode = require("../../AccountingCode/Model/AccountingCodeModel");
const Branch = require("../../Branch/Model/BranchModel");
const { Driver } = require("../../Driver/Model/DriverModel");
const Task = require("../../StaffPerformance/Model/TaskModel");
const Target = require("../../StaffPerformance/Model/TargetModel");
const FinanceStaff = require("../../FinanceStaff/Model/FinanceStaffModel");
const OperationStaff = require("../../OperationStaff/Model/OperationStaffModel");
const WorkshopStaff = require("../../WorkshopStaff/Model/WorkshopStaffModel");
const WorkshopManager = require("../../WorkshopManager/Model/WorkshopManagerModel");

const normalizeCategory = (categoryStr) => {
    if (!categoryStr) return "";
    const cat = categoryStr.trim().toLowerCase();

    // INCOME / REVENUE
    if (cat === 'income' || cat === 'revenue' || cat === 'sales' || cat.includes('income') || cat.includes('revenue')) {
        return 'INCOME';
    }

    // EXPENSES
    if (cat === 'expense' || cat === 'expenses' || cat.includes('expense') || cat.includes('cost of goods sold') || cat.includes('cost_of_goods_sold')) {
        return 'EXPENSE';
    }

    // ASSETS
    if (
        cat.includes('asset') ||
        cat.includes('receivable') ||
        cat === 'cash' ||
        cat === 'bank' ||
        cat.includes('cash') ||
        cat.includes('bank') ||
        cat === 'input tax' ||
        cat === 'input_tax'
    ) {
        // Exception: 'output tax' / 'output_tax' is liability, not asset
        if (cat.includes('output tax') || cat.includes('output_tax')) {
            return 'LIABILITY';
        }
        return 'ASSET';
    }

    // LIABILITY
    if (
        cat.includes('liability') ||
        cat.includes('liabilities') ||
        cat.includes('liab') ||
        cat.includes('payable') ||
        cat.includes('output tax') ||
        cat.includes('output_tax') ||
        cat.includes('tax') // fallback for other taxes
    ) {
        return 'LIABILITY';
    }

    // EQUITY
    if (cat.includes('equity') || cat.includes('stock') || cat.includes('capital') || cat.includes('retained')) {
        return 'EQUITY';
    }

    // Mapped fallbacks
    if (cat === 'income') return 'INCOME';
    if (cat === 'expense' || cat === 'expenses') return 'EXPENSE';
    if (cat === 'asset' || cat === 'assets') return 'ASSET';
    if (cat === 'liability' || cat === 'liabilities') return 'LIABILITY';
    if (cat === 'equity') return 'EQUITY';

    return categoryStr.toUpperCase();
};

const filterDuplicateLedgerEntries = (entries) => {
    const seen = new Set();
    return entries.filter(e => {
        if (!e.accountingCode) return false;

        const dateStr = e.entryDate ? new Date(e.entryDate).toISOString().split('T')[0] : '';
        const cleanDesc = (e.description || '').replace(/\d+/g, "").toLowerCase().trim();
        const accountId = e.accountingCode._id ? e.accountingCode._id.toString() : e.accountingCode.toString();

        const key = `${accountId}_${dateStr}_${e.type}_${e.amount || 0}_${cleanDesc}`;
        if (seen.has(key)) {
            return false;
        }
        seen.add(key);
        return true;
    });
};

exports.getPLReport = async (filters) => {
    const { branch, country, startDate, endDate } = filters;

    if (!startDate || !endDate) {
        return {
            income: [],
            expenses: [],
            netProfit: 0,
            message: "Please select a date range to generate the Profit & Loss report."
        };
    }

    const query = { isDeleted: { $ne: true } };

    if (branch) {
        query.branch = branch;
    } else if (country) {
        const branches = await Branch.find({ country, isDeleted: false });
        const branchIds = branches.map(b => b._id);
        query.branch = { $in: branchIds };
    }

    query.entryDate = {};
    if (startDate) {
        const startStr = startDate.includes("T") ? startDate : `${startDate}T00:00:00.000Z`;
        query.entryDate.$gte = new Date(startStr);
    }
    if (endDate) {
        const endStr = endDate.includes("T") ? endDate : `${endDate}T23:59:59.999Z`;
        query.entryDate.$lte = new Date(endStr);
    }

    const pipeline = [
        { $match: query },
        {
            $group: {
                _id: "$accountingCode",
                debitSum: {
                    $sum: {
                        $cond: [{ $eq: ["$type", "DEBIT"] }, "$amount", 0]
                    }
                },
                creditSum: {
                    $sum: {
                        $cond: [{ $eq: ["$type", "CREDIT"] }, "$amount", 0]
                    }
                }
            }
        },
        {
            $lookup: {
                from: AccountingCode.collection.name,
                localField: "_id",
                foreignField: "_id",
                as: "codeDetails"
            }
        },
        { $unwind: "$codeDetails" }
    ];

    const aggregated = await LedgerEntry.aggregate(pipeline);

    const report = {
        income: {},
        expenses: {},
        netProfit: 0
    };

    // Pre-populate all active Income and Expense accounting codes from Chart of Accounts
    try {
        const allActiveCodes = await AccountingCode.find({
            isActive: true,
            isDeleted: false
        }).select('name category accountType code _id parentAccount').lean();

        allActiveCodes.forEach(code => {
            const category = normalizeCategory(code.category);
            if (category === "INCOME") {
                report.income[code.name] = { amount: 0, code: code.code, accountType: code.accountType, category: code.category, id: code._id, parentAccount: code.parentAccount || null };
            } else if (category === "EXPENSE") {
                report.expenses[code.name] = { amount: 0, code: code.code, accountType: code.accountType, category: code.category, id: code._id, parentAccount: code.parentAccount || null };
            }
        });
    } catch (e) {
        console.error("Error pre-populating P&L codes:", e);
    }

    aggregated.forEach(row => {
        const code = row.codeDetails;
        if (!code) return;

        const category = normalizeCategory(code.category);
        if (category === "INCOME") {
            const val = row.creditSum - row.debitSum;
            if (!report.income[code.name]) {
                report.income[code.name] = { amount: 0, code: code.code, accountType: code.accountType, category: code.category, id: code._id, parentAccount: code.parentAccount || null };
            }
            report.income[code.name].amount = val;
        } else if (category === "EXPENSE") {
            const val = row.debitSum - row.creditSum;
            if (!report.expenses[code.name]) {
                report.expenses[code.name] = { amount: 0, code: code.code, accountType: code.accountType, category: code.category, id: code._id, parentAccount: code.parentAccount || null };
            }
            report.expenses[code.name].amount = val;
        }
    });

    const incomeArray = Object.keys(report.income).map(name => ({
        name,
        amount: report.income[name].amount,
        code: report.income[name].code,
        accountType: report.income[name].accountType,
        category: report.income[name].category,
        id: report.income[name].id,
        parentAccount: report.income[name].parentAccount || null
    }));
    const expenseArray = Object.keys(report.expenses).map(name => ({
        name,
        amount: report.expenses[name].amount,
        code: report.expenses[name].code,
        accountType: report.expenses[name].accountType,
        category: report.expenses[name].category,
        id: report.expenses[name].id,
        parentAccount: report.expenses[name].parentAccount || null
    }));

    const totalIncome = incomeArray.reduce((acc, curr) => acc + curr.amount, 0);
    const totalExpense = expenseArray.reduce((acc, curr) => acc + curr.amount, 0);

    return {
        income: incomeArray,
        expenses: expenseArray,
        netProfit: totalIncome - totalExpense
    };
};

exports.getBalanceSheetReport = async (filters) => {
    const { branch, country, startDate, endDate } = filters;

    if (!endDate) {
        return {
            assets: [],
            liabilities: [],
            equity: [],
            assetsTotal: 0,
            liabilitiesTotal: 0,
            equityTotal: 0,
            message: "Please select an end date to generate the Balance Sheet."
        };
    }

    const query = { isDeleted: { $ne: true } };

    if (branch) {
        query.branch = branch;
    } else if (country) {
        const branches = await Branch.find({ country, isDeleted: false });
        const branchIds = branches.map(b => b._id);
        query.branch = { $in: branchIds };
    }

    const endStr = endDate.includes("T") ? endDate : `${endDate}T23:59:59.999Z`;
    const end = new Date(endStr);
    query.entryDate = { $lte: end };

    const pipeline = [
        { $match: query },
        {
            $group: {
                _id: "$accountingCode",
                debitSum: {
                    $sum: {
                        $cond: [{ $eq: ["$type", "DEBIT"] }, "$amount", 0]
                    }
                },
                creditSum: {
                    $sum: {
                        $cond: [{ $eq: ["$type", "CREDIT"] }, "$amount", 0]
                    }
                }
            }
        },
        {
            $lookup: {
                from: AccountingCode.collection.name,
                localField: "_id",
                foreignField: "_id",
                as: "codeDetails"
            }
        },
        { $unwind: "$codeDetails" }
    ];

    const aggregated = await LedgerEntry.aggregate(pipeline);

    const report = {
        assets: {},
        liabilities: {},
        equity: {}
    };

    // Pre-populate ALL active Chart of Accounts so every account appears in the report
    // (even those with zero activity). Ledger aggregation below will overwrite with real balances.
    try {
        const allActiveCodes = await AccountingCode.find({
            isActive: true,
            isDeleted: false
        }).select('name category accountType code _id').lean();

        allActiveCodes.forEach(acc => {
            const normalizedCat = normalizeCategory(acc.category);
            // Income and Expense accounts never appear on the Balance Sheet
            if (normalizedCat === 'INCOME' || normalizedCat === 'EXPENSE') return;
            if (normalizedCat === 'ASSET') {
                report.assets[acc.name] = {
                    amount: 0,
                    category: acc.category,
                    accountType: acc.accountType,
                    code: acc.code,
                    _id: acc._id
                };
            } else if (normalizedCat === 'LIABILITY') {
                report.liabilities[acc.name] = {
                    amount: 0,
                    category: acc.category,
                    accountType: acc.accountType,
                    code: acc.code,
                    _id: acc._id
                };
            } else if (normalizedCat === 'EQUITY') {
                report.equity[acc.name] = {
                    amount: 0,
                    category: acc.category,
                    accountType: acc.accountType,
                    code: acc.code,
                    _id: acc._id
                };
            }
        });
    } catch (prepopErr) {
        console.error("Failed to pre-populate Chart of Accounts:", prepopErr);
    }


    let cumulativeNetIncome = 0;
    if (startDate && endDate) {
        try {
            const plReport = await exports.getPLReport({ branch, country, startDate, endDate });
            cumulativeNetIncome = plReport.netProfit;
        } catch (plErr) {
            console.error("Failed to fetch P&L report for Balance Sheet Net Income:", plErr);
        }
    }

    aggregated.forEach(row => {
        const code = row.codeDetails;
        if (!code) return;

        const category = normalizeCategory(code.category);
        if (category === "ASSET") {
            const val = row.debitSum - row.creditSum;
            if (!report.assets[code.name]) {
                report.assets[code.name] = { amount: 0, category: code.category, accountType: code.accountType, code: code.code, _id: code._id };
            }
            report.assets[code.name].amount += val;
        } else if (category === "LIABILITY") {
            const val = row.creditSum - row.debitSum;
            if (!report.liabilities[code.name]) {
                report.liabilities[code.name] = { amount: 0, category: code.category, accountType: code.accountType, code: code.code };
            }
            report.liabilities[code.name].amount += val;
        } else if (category === "EQUITY") {
            const val = row.creditSum - row.debitSum;
            if (!report.equity[code.name]) {
                report.equity[code.name] = { amount: 0, category: code.category, accountType: code.accountType, code: code.code };
            }
            report.equity[code.name].amount += val;
        } else if (!startDate) {
            if (category === "INCOME") {
                cumulativeNetIncome += (row.creditSum - row.debitSum);
            } else if (category === "EXPENSE") {
                cumulativeNetIncome -= (row.debitSum - row.creditSum);
            }
        }
    });

    // Overwrite Cash and Bank asset balances with dynamic ledger closing balances (Debit - Credit) up to endDate
    try {
        const cashBankCodes = await AccountingCode.find({
            $or: [
                { accountType: { $in: ['Cash', 'Bank'] } },
                { name: /cash|bank|banco|caja|petty|bct/i }
            ],
            isActive: true,
            isDeleted: false
        });

        if (cashBankCodes.length > 0) {
            const cashBankIds = cashBankCodes.map(c => c._id);
            const ledgerQuery = { accountingCode: { $in: cashBankIds }, entryDate: { $lte: end } };
            if (branch) {
                ledgerQuery.branch = branch;
            }

            const stats = await LedgerEntry.aggregate([
                { $match: ledgerQuery },
                {
                    $group: {
                        _id: {
                            accountingCode: "$accountingCode",
                            type: "$type"
                        },
                        total: { $sum: "$amount" }
                    }
                }
            ]);

            const balanceMap = {};
            stats.forEach(s => {
                if (s._id && s._id.accountingCode) {
                    const codeIdStr = s._id.accountingCode.toString();
                    if (!balanceMap[codeIdStr]) {
                        balanceMap[codeIdStr] = { debit: 0, credit: 0 };
                    }
                    if (s._id.type === "DEBIT") {
                        balanceMap[codeIdStr].debit = s.total || 0;
                    } else if (s._id.type === "CREDIT") {
                        balanceMap[codeIdStr].credit = s.total || 0;
                    }
                }
            });

            for (const code of cashBankCodes) {
                // Only override in the ASSETS bucket if this account truly belongs there.
                // Accounts whose name matches /bank|banco/ but whose category is LIABILITY
                // (e.g. bank loans) must NOT appear under Assets.
                const codeNormalizedCat = normalizeCategory(code.category);
                if (codeNormalizedCat !== 'ASSET') continue;

                const bal = balanceMap[code._id.toString()] || { debit: 0, credit: 0 };
                const closingBalance = bal.debit - bal.credit;

                report.assets[code.name] = {
                    amount: closingBalance,
                    category: code.category,
                    accountType: code.accountType,
                    code: code.code,
                    _id: code._id
                };
            }
        }
    } catch (overwriteErr) {
        console.error("Failed to overwrite cash/bank balances with ledger closing balances:", overwriteErr);
    }

    if (cumulativeNetIncome !== 0) {
        if (!report.equity["Retained Earnings (Current Period)"]) {
            report.equity["Retained Earnings (Current Period)"] = {
                amount: 0,
                category: "Equity",
                accountType: "Equity",
                code: "RE-CURRENT"
            };
        }
        report.equity["Retained Earnings (Current Period)"].amount += cumulativeNetIncome;
    }

    // Map raw DB category → proper accountType label for display
    const resolveAssetAccountType = (rawCategory, existingAccountType) => {
        // If a specific, meaningful accountType already exists, use it
        if (existingAccountType && existingAccountType !== 'Asset' && existingAccountType !== 'ASSET') {
            return existingAccountType;
        }
        const cat = (rawCategory || '').toLowerCase().trim();
        if (cat === 'cash') return 'Cash';
        if (cat === 'bank') return 'Bank';
        if (cat === 'accounts receivable') return 'Accounts Receivable';
        if (cat === 'fixed asset') return 'Fixed Asset';
        if (cat === 'input tax' || cat === 'input_tax') return 'Other Current Asset';
        if (cat === 'other current asset') return 'Other Current Asset';
        if (cat === 'other asset') return 'Other Asset';
        if (cat === 'asset' || cat === 'assets') return 'Other Current Asset';
        // Fallback: return the raw category as-is, or default
        return existingAccountType || 'Other Current Asset';
    };

    // Build assets array — exclude any entry whose category resolves to LIABILITY or EQUITY
    // (safety guard in case a mis-categorised account slipped into report.assets)
    const assetsArray = Object.keys(report.assets)
        .map(name => ({
            name,
            amount: report.assets[name].amount,
            category: report.assets[name].category,
            accountType: resolveAssetAccountType(report.assets[name].category, report.assets[name].accountType),
            code: report.assets[name].code
        }))
        .filter(item => {
            const cat = normalizeCategory(item.category);
            return cat === 'ASSET' || cat === '';
        });
    // Map raw DB category → proper accountType label for liabilities
    const resolveLiabilityAccountType = (rawCategory, existingAccountType) => {
        const type = (existingAccountType || '').toLowerCase().trim();
        const cat = (rawCategory || '').toLowerCase().trim();

        // Output Tax is grouped under Other Current Liability per user request
        if (type === 'output tax' || type === 'output_tax' || cat === 'output tax' || cat === 'output_tax') {
            return 'Other Current Liability';
        }

        if (type === 'accounts payable' || cat === 'accounts payable' || type === 'payable' || cat === 'payable') {
            return 'Accounts Payable';
        }

        if (
            type.includes('non current') ||
            type.includes('non-current') ||
            type.includes('non_current') ||
            cat.includes('non current') ||
            cat.includes('non-current') ||
            cat.includes('non_current') ||
            cat === 'non current liab'
        ) {
            return 'Non Current Liability';
        }

        if (type.includes('other current') || cat.includes('other current')) {
            return 'Other Current Liability';
        }

        if (type.includes('other liability') || type.includes('other liabilities') || cat.includes('other liability') || cat.includes('other liabilities')) {
            return 'Other Liability';
        }

        if (existingAccountType && existingAccountType !== 'Liability' && existingAccountType !== 'LIABILITY') {
            return existingAccountType;
        }

        return existingAccountType || 'Other Current Liability';
    };

    const liabilitiesArray = Object.keys(report.liabilities).map(name => ({
        name,
        amount: report.liabilities[name].amount,
        category: report.liabilities[name].category,
        accountType: resolveLiabilityAccountType(report.liabilities[name].category, report.liabilities[name].accountType),
        code: report.liabilities[name].code
    }));
    const rawEquityArray = Object.keys(report.equity).map(name => ({
        name,
        amount: report.equity[name].amount || 0,
        category: report.equity[name].category,
        accountType: report.equity[name].accountType || 'Equity',
        code: report.equity[name].code
    }));

    // Find the Current Period Results
    const currentPeriodItem = rawEquityArray.find(e => e.code === "RE-CURRENT" || e.name.includes("Current Period"));
    const resultsOfTheExercise = currentPeriodItem ? currentPeriodItem.amount : 0;

    // Filter database equity to exclude current period and any matching retained earnings/utilidades retenidas
    const databaseEquity = rawEquityArray.filter(e =>
        e.code !== "RE-CURRENT" &&
        !e.name.includes("Current Period") &&
        !e.name.toLowerCase().includes("retained earnings") &&
        !e.name.toLowerCase().includes("utilidades retenidas")
    );

    const staticRetainedEarnings = 258789.00;

    const equityArray = [
        ...databaseEquity,
        {
            name: "Retained Earnings / Utilidades Retenidas",
            amount: staticRetainedEarnings,
            category: "Equity",
            accountType: "Equity",
            code: "RE-STATIC"
        },
        {
            name: "Results of the exercise / Resultado del ejercicio",
            amount: resultsOfTheExercise,
            category: "Equity",
            accountType: "Equity",
            code: "RE-CURRENT"
        }
    ];


    const assetsTotal = assetsArray.reduce((acc, curr) => acc + curr.amount, 0);
    const liabilitiesTotal = liabilitiesArray.reduce((acc, curr) => acc + curr.amount, 0);
    const equityTotal = equityArray.reduce((acc, curr) => acc + curr.amount, 0);

    return {
        assets: assetsArray,
        liabilities: liabilitiesArray,
        equity: equityArray,
        assetsTotal,
        liabilitiesTotal,
        equityTotal
    };
};

exports.getDailyFinanceReport = async (filters) => {
    const { branch, country, startDate, endDate } = filters;

    const query = {};
    if (branch) {
        query.branch = branch;
    } else if (country) {
        const branches = await Branch.find({ country, isDeleted: false });
        const branchIds = branches.map(b => b._id);
        query.branch = { $in: branchIds };
    }

    if (startDate || endDate) {
        query.entryDate = {};
        if (startDate) query.entryDate.$gte = new Date(startDate);
        if (endDate) {
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999);
            query.entryDate.$lte = end;
        }
    }

    const rawEntries = await LedgerEntry.find(query).populate("accountingCode").lean();
    const entries = filterDuplicateLedgerEntries(rawEntries);

    const dailyData = {};

    entries.forEach(entry => {
        const date = entry.entryDate.toISOString().split('T')[0];
        if (!dailyData[date]) {
            dailyData[date] = { date, income: 0, expenses: 0 };
        }

        const amount = entry.amount || 0;
        const code = entry.accountingCode;
        if (!code) return;

        if (code.category === "INCOME") {
            dailyData[date].income += (entry.type === "CREDIT" ? amount : -amount);
        } else if (code.category === "EXPENSE") {
            dailyData[date].expenses += (entry.type === "DEBIT" ? amount : -amount);
        }
    });

    return Object.values(dailyData).sort((a, b) => a.date.localeCompare(b.date));
};

exports.getDriverPerformanceReport = async (filters) => {
    const { branch, country } = filters;

    const query = { isDeleted: false };
    if (branch) {
        query.branch = branch;
    } else if (country) {
        const branches = await Branch.find({ country, isDeleted: false });
        const branchIds = branches.map(b => b._id);
        query.branch = { $in: branchIds };
    }

    const drivers = await Driver.find(query)
        .select("personalInfo performance rentTracking branch")
        .populate("branch", "name");

    return drivers.map(driver => {
        const lastRent = driver.rentTracking && driver.rentTracking.length > 0
            ? driver.rentTracking[driver.rentTracking.length - 1]
            : null;

        return {
            id: driver._id,
            name: driver.personalInfo.fullName,
            branch: driver.branch?.name || "N/A",
            avgSpeed: driver.performance?.avgSpeed || 0,
            totalDistance: driver.performance?.totalDistance || 0,
            drivingScore: driver.performance?.drivingScore || 0,
            fuelEfficiency: driver.performance?.fuelEfficiency || 0,
            rentStatus: lastRent ? lastRent.status : "N/A",
            rentBalance: lastRent ? lastRent.balance : 0
        };
    });
};

exports.getStaffPerformanceReport = async (filters) => {
    const { branch, country } = filters;

    let branchIds = [];
    if (branch) {
        branchIds = [branch];
    } else if (country) {
        const branches = await Branch.find({ country, isDeleted: false });
        branchIds = branches.map(b => b._id);
    }

    if (branchIds.length === 0 && !branch && !country) return [];

    const staffQuery = { isDeleted: false };
    if (branchIds.length > 0) staffQuery.branchId = { $in: branchIds };

    // Get all staff in these branches (Finance, Operation, Workshop)
    const finStaff = await FinanceStaff.find(staffQuery).lean();
    const opStaff = await OperationStaff.find(staffQuery).lean();
    const wsStaff = await WorkshopStaff.find(staffQuery).lean();
    const wsManagers = await WorkshopManager.find(staffQuery).lean();

    const staff = [
        ...finStaff.map(s => ({ ...s, role: 'FINANCESTAFF' })),
        ...opStaff.map(s => ({ ...s, role: 'OPERATIONSTAFF' })),
        ...wsStaff.map(s => ({ ...s, role: 'WORKSHOPSTAFF' })),
        ...wsManagers.map(s => ({ ...s, role: 'WORKSHOPMANAGER' }))
    ];

    const staffIds = staff.map(s => s._id);

    const tasks = await Task.find({ assignedTo: { $in: staffIds } });
    const targets = await Target.find({ targetId: { $in: staffIds.map(id => id.toString()) }, targetType: "STAFF" });

    return staff.map(s => {
        const sTasks = tasks.filter(t => t.assignedTo.toString() === s._id.toString());
        const sTargets = targets.filter(t => t.targetId === s._id.toString());

        const completedTasks = sTasks.filter(t => t.status === "COMPLETED").length;
        const totalTasks = sTasks.length;

        return {
            id: s._id,
            name: s.fullName,
            role: s.role,
            tasksCompleted: completedTasks,
            totalTasks: totalTasks,
            taskCompletionRate: totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0,
            activeTargets: sTargets.length,
            targetsMet: 0 // Logic for targets met can be added if needed, e.g. checking performance metrics
        };
    });
};

exports.getBankBalanceSheetReport = async (filters) => {
    const { startDate, endDate, bankAccount, branch } = filters;
    const BankAccount = require("../../BankAccount/Model/BankAccountModel");
    const BankTransaction = require("../../BankAccount/Model/BankTransactionModel");

    const end = endDate ? new Date(endDate) : new Date();
    if (endDate) {
        end.setHours(23, 59, 59, 999);
    }

    if (bankAccount) {
        const account = await BankAccount.findOne({ _id: bankAccount, isDeleted: false }).populate("accountingCode");
        if (!account) {
            throw new Error("Bank account not found");
        }

        const txQuery = { bankAccount, isDeleted: { $ne: true } };
        if (branch) {
            txQuery.branch = branch;
        }

        txQuery.entryDate = { $lte: end };
        if (startDate) {
            txQuery.entryDate.$gte = new Date(startDate);
        }

        const transactions = await BankTransaction.find(txQuery).sort({ entryDate: 1, _id: 1 }).lean();

        let startingBalance = account.initialBalance || 0;
        if (startDate) {
            const preTxQuery = { bankAccount, entryDate: { $lt: new Date(startDate) } };
            if (branch) {
                preTxQuery.branch = branch;
            }
            const preTx = await BankTransaction.findOne(preTxQuery).sort({ entryDate: -1, _id: -1 });
            if (preTx) {
                startingBalance = preTx.runningBalance;
            }
        }

        return {
            reportType: "single-account",
            account: {
                id: account._id,
                name: account.accountName || account.bankName,
                number: account.accountNumber,
                code: account.accountCode,
                type: account.accountType,
                currency: account.currency || "USD"
            },
            startingBalance,
            transactions: transactions.map(tx => ({
                id: tx._id,
                date: tx.entryDate,
                description: tx.description,
                reference: tx.transactionId,
                type: tx.type,
                amount: tx.amount,
                runningBalance: tx.runningBalance
            })),
            endingBalance: transactions.length > 0 ? transactions[transactions.length - 1].runningBalance : startingBalance
        };
    } else {
        const accountsQuery = { isDeleted: false };
        const accounts = await BankAccount.find(accountsQuery).populate("accountingCode").lean();

        const cashAccountsList = [];
        const bankAccountsList = [];
        let cashTotal = 0;
        let bankTotal = 0;

        for (const account of accounts) {
            const txQuery = { bankAccount: account._id, entryDate: { $lte: end } };
            if (branch) {
                txQuery.branch = branch;
            }
            const lastTx = await BankTransaction.findOne(txQuery).sort({ entryDate: -1, _id: -1 });
            const balance = lastTx ? lastTx.runningBalance : (branch ? 0 : (account.initialBalance || 0));

            const mappedAcc = {
                id: account._id,
                name: account.accountName || account.bankName,
                number: account.accountNumber,
                code: account.accountCode,
                type: account.accountType || "Bank",
                currency: account.currency || "USD",
                balance
            };

            if (account.accountType === "Cash") {
                cashAccountsList.push(mappedAcc);
                cashTotal += balance;
            } else {
                bankAccountsList.push(mappedAcc);
                bankTotal += balance;
            }
        }

        return {
            reportType: "all-accounts",
            cashAccounts: cashAccountsList,
            bankAccounts: bankAccountsList,
            cashTotal,
            bankTotal,
            grandTotal: cashTotal + bankTotal
        };
    }
};

// Self-trigger diagnostics on server start
setTimeout(async () => {
    try {
        console.log("[BG DIAGNOSTICS] Self-triggering balance sheet report...");
        await exports.getBalanceSheetReport({ endDate: '2026-06-15' });
        console.log("[BG DIAGNOSTICS] Self-trigger completed.");

        // Debug Nitzia Petty Cash entries
        const fs = require('fs');
        const path = require('path');
        const codeId = "6a280daa4f5923cd64ec3161"; // Nitzia-Petty Cash
        const end = new Date("2026-06-15T23:59:59.999Z");
        const queryWithDate = { accountingCode: codeId, entryDate: { $lte: end } };
        const queryAll = { accountingCode: codeId };

        const entriesWithDate = await LedgerEntry.find(queryWithDate).sort({ entryDate: -1, _id: -1 }).lean();
        const allEntries = await LedgerEntry.find(queryAll).sort({ entryDate: -1, _id: -1 }).lean();

        const debugData = {
            totalEntriesUpToDate: entriesWithDate.length,
            totalEntriesAllTime: allEntries.length,
            entriesUpToDate: entriesWithDate.map(e => ({
                id: e._id,
                entryDate: e.entryDate,
                type: e.type,
                amount: e.amount,
                runningBalance: e.runningBalance,
                description: e.description
            })),
            allEntries: allEntries.map(e => ({
                id: e._id,
                entryDate: e.entryDate,
                type: e.type,
                amount: e.amount,
                runningBalance: e.runningBalance,
                description: e.description
            }))
        };

        fs.writeFileSync(path.join(__dirname, '../../../../tmp/nitzia_petty_cash_debug.json'), JSON.stringify(debugData, null, 2));
        console.log("[BG DIAGNOSTICS] Wrote Nitzia Petty Cash debug info to file.");
    } catch (err) {
        console.error("[BG DIAGNOSTICS] Self-trigger failed:", err);
    }
}, 3000); // Wait 3 seconds for connection

