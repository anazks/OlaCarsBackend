const LedgerEntry = require("../../Ledger/Model/LedgerEntryModel");
const AccountingCode = require("../../AccountingCode/Model/AccountingCodeModel");

exports.getPLReport = async (filters) => {
    const { branch, startDate, endDate } = filters;
    
    const query = {};
    if (branch) query.branch = branch;
    if (startDate || endDate) {
        query.entryDate = {};
        if (startDate) query.entryDate.$gte = new Date(startDate);
        if (endDate) {
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999);
            query.entryDate.$lte = end;
        }
    }

    const entries = await LedgerEntry.find(query).populate("accountingCode");

    const report = {
        income: {},
        expenses: {},
        netProfit: 0
    };

    entries.forEach(entry => {
        const code = entry.accountingCode;
        if (!code) return;

        const amount = entry.amount || 0;
        const type = entry.type;

        if (code.category === "INCOME") {
            const val = type === "CREDIT" ? amount : -amount;
            report.income[code.name] = (report.income[code.name] || 0) + val;
        } else if (code.category === "EXPENSE") {
            const val = type === "DEBIT" ? amount : -amount;
            report.expenses[code.name] = (report.expenses[code.name] || 0) + val;
        }
    });

    // Convert objects to arrays for frontend
    const incomeArray = Object.keys(report.income).map(name => ({ name, amount: report.income[name] }));
    const expenseArray = Object.keys(report.expenses).map(name => ({ name, amount: report.expenses[name] }));

    const totalIncome = incomeArray.reduce((acc, curr) => acc + curr.amount, 0);
    const totalExpense = expenseArray.reduce((acc, curr) => acc + curr.amount, 0);

    return {
        income: incomeArray,
        expenses: expenseArray,
        netProfit: totalIncome - totalExpense
    };
};

exports.getBalanceSheetReport = async (filters) => {
    const { branch, endDate } = filters;
    
    const query = {};
    if (branch) query.branch = branch;
    if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        query.entryDate = { $lte: end };
    }

    const entries = await LedgerEntry.find(query).populate("accountingCode");

    const report = {
        assets: {},
        liabilities: {},
        equity: {}
    };

    entries.forEach(entry => {
        const code = entry.accountingCode;
        if (!code) return;

        const amount = entry.amount || 0;
        const type = entry.type;

        if (code.category === "ASSET") {
            const val = type === "DEBIT" ? amount : -amount;
            report.assets[code.name] = (report.assets[code.name] || 0) + val;
        } else if (code.category === "LIABILITY") {
            const val = type === "CREDIT" ? amount : -amount;
            report.liabilities[code.name] = (report.liabilities[code.name] || 0) + val;
        } else if (code.category === "EQUITY") {
            const val = type === "CREDIT" ? amount : -amount;
            report.equity[code.name] = (report.equity[code.name] || 0) + val;
        }
    });

    const assetsArray = Object.keys(report.assets).map(name => ({ name, amount: report.assets[name] }));
    const liabilitiesArray = Object.keys(report.liabilities).map(name => ({ name, amount: report.liabilities[name] }));
    const equityArray = Object.keys(report.equity).map(name => ({ name, amount: report.equity[name] }));

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
