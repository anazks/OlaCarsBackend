const SalaryStructure = require("../Model/SalaryStructureModel");
const SalaryPayment = require("../Model/SalaryPaymentModel");
const LedgerService = require("../../Ledger/Service/LedgerService");
const AccountingCode = require("../../AccountingCode/Model/AccountingCodeModel");
const AppError = require("../../../shared/utils/AppError");

exports.getStaffSalaryStructures = async () => {
    return await SalaryStructure.find().populate("staffId");
};

exports.updateSalaryStructure = async (data) => {
    const { staffId, staffRole, ...updateData } = data;
    return await SalaryStructure.findOneAndUpdate(
        { staffId, staffRole },
        { ...updateData, staffId, staffRole },
        { upsert: true, new: true }
    );
};

exports.processPayroll = async (data) => {
    const { staffId, staffRole, month, year, processedBy, processorRole } = data;

    // 1. Get Salary Structure
    const structure = await SalaryStructure.findOne({ staffId, staffRole, status: "ACTIVE" });
    if (!structure) {
        throw new AppError("Active salary structure not found for this staff member.", 404);
    }

    // 2. Calculate Totals
    const totalAllowances = structure.allowances.reduce((sum, item) => sum + item.amount, 0);
    const totalBonuses = structure.bonuses.reduce((sum, item) => sum + item.amount, 0);
    const totalDeductions = structure.deductions.reduce((sum, item) => sum + item.amount, 0);
    const leaveDeduction = data.leaveDeduction || 0;
    const netSalary = structure.baseSalary + totalAllowances + totalBonuses - totalDeductions - leaveDeduction;

    // 3. Find Salary Expense Account (Code 5400 or name containing Salary)
    const salaryAccount = await AccountingCode.findOne({ 
        $or: [{ code: "5400" }, { name: /Salary/i }] 
    });

    if (!salaryAccount) {
        throw new AppError("Salary Expense accounting code (5400) not found in Chart of Accounts.", 400);
    }

    // 4. Create Ledger Entry (DEBIT)
    const ledgerEntry = await LedgerService.create({
        accountingCode: salaryAccount._id,
        type: "DEBIT",
        amount: netSalary,
        description: `Monthly Salary Payment - ${month}/${year} for Staff ID: ${staffId}`,
        branch: data.branchId || null, // Should ideally come from the staff member's branch
        createdBy: processedBy,
        creatorRole: processorRole,
        entryDate: new Date()
    });

    // 5. Record Payment
    const payment = await SalaryPayment.create({
        staffId,
        staffRole,
        month,
        year,
        baseSalary: structure.baseSalary,
        totalAllowances,
        totalBonuses,
        totalDeductions,
        leaveDeduction,
        netSalary,
        ledgerEntry: ledgerEntry._id,
        status: "PAID",
        processedBy,
        processorRole
    });

    return { payment, ledgerEntry };
};
