const LedgerEntry = require("../../Ledger/Model/LedgerEntryModel");
const AccountingCode = require("../../AccountingCode/Model/AccountingCodeModel");
const Branch = require("../../Branch/Model/BranchModel");
const { Driver } = require("../../Driver/Model/DriverModel");
const { Task } = require("../../StaffPerformance/Model/TaskModel");
const { Target } = require("../../StaffPerformance/Model/TargetModel");
const FinanceStaff = require("../../FinanceStaff/Model/FinanceStaffModel");
const OperationStaff = require("../../OperationStaff/Model/OperationStaffModel");
const WorkshopStaff = require("../../WorkshopStaff/Model/WorkshopStaffModel");
const WorkshopManager = require("../../WorkshopManager/Model/WorkshopManagerModel");

exports.getPLReport = async (filters) => {
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
    const { branch, country, endDate } = filters;
    
    const query = {};
    
    if (branch) {
        query.branch = branch;
    } else if (country) {
        const branches = await Branch.find({ country, isDeleted: false });
        const branchIds = branches.map(b => b._id);
        query.branch = { $in: branchIds };
    }

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

    const entries = await LedgerEntry.find(query).populate("accountingCode");

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
