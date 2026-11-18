const mongoose = require("mongoose");
const { Driver } = require("../../Driver/Model/DriverModel");
const { Vehicle } = require("../../Vehicle/Model/VehicleModel");
const FinanceStaff = require("../../FinanceStaff/Model/FinanceStaffModel");
const OperationStaff = require("../../OperationStaff/Model/OperationStaffModel");
const WorkshopStaff = require("../../WorkshopStaff/Model/WorkshopStaffModel");
const WorkshopManager = require("../../WorkshopManager/Model/WorkshopManagerModel");
const BranchManager = require("../../BranchManager/Model/BranchManagerModel");
const CountryManager = require("../../CountryManager/Model/CountryManagerModel");
const FinanceAdmin = require("../../FinanceAdmin/model/FinanceAdminModel");
const OperationAdmin = require("../../OperationAdmin/model/OperationAdminModel");
const Admin = require("../../Admin/model/adminModel");
const Task = require("../Model/TaskModel");
const Target = require("../Model/TargetModel");
const SalaryStructure = require("../../Salary/Model/SalaryStructureModel");
const SalaryPayment = require("../../Salary/Model/SalaryPaymentModel");
const { Invoice } = require("../../Invoice/Model/InvoiceModel");
const Bill = require("../../Bill/Model/BillModel");
const DebitNote = require("../../DebitNote/Model/DebitNoteModel");
const CreditNote = require("../../CreditNote/Model/CreditNoteModel");
const BankTransaction = require("../../BankAccount/Model/BankTransactionModel");
const LedgerEntry = require("../../Ledger/Model/LedgerEntryModel");
const BankAccount = require("../../BankAccount/Model/BankAccountModel");
const SystemUpload = require("../Model/SystemUploadModel");
const StaffActivityLog = require("../Model/StaffActivityLogModel");
const { ROLES } = require("../../../shared/constants/roles");

/**
 * Finds a staff member across all possible collections by ID.
 * Returns { staff, role }
 */
const findStaffById = async (id) => {
    const collections = [
        { model: FinanceStaff, role: ROLES.FINANCESTAFF },
        { model: OperationStaff, role: ROLES.OPERATIONSTAFF },
        { model: WorkshopStaff, role: ROLES.WORKSHOPSTAFF },
        { model: WorkshopManager, role: ROLES.WORKSHOPMANAGER },
        { model: BranchManager, role: ROLES.BRANCHMANAGER },
        { model: CountryManager, role: ROLES.COUNTRYMANAGER },
        { model: FinanceAdmin, role: ROLES.FINANCEADMIN },
        { model: OperationAdmin, role: ROLES.OPERATIONADMIN },
        { model: Admin, role: ROLES.ADMIN },
    ];

    for (const { model, role } of collections) {
        if (!model) continue;
        let query = model.findById(id).lean();
        if (model.schema && model.schema.path("branchId")) {
            query = query.populate("branchId");
        }
        const staff = await query;
        if (staff) return { staff, role };
    }
    return null;
};

exports.getStaffDetailsRepo = async (staffId, startDate, endDate) => {
    const result = await findStaffById(staffId);
    if (!result) throw new Error("Staff member not found");

    const { staff, role } = result;

    const start = startDate ? new Date(startDate) : new Date(new Date().setDate(1));
    const end = endDate ? new Date(endDate) : new Date();
    end.setHours(23, 59, 59, 999);

    const dateFilter = {
        createdAt: { $gte: start, $lte: end }
    };

    const staffObjectId = mongoose.Types.ObjectId.isValid(staffId) 
        ? new mongoose.Types.ObjectId(staffId) 
        : staffId;
    const staffIdVariants = mongoose.Types.ObjectId.isValid(staffId)
        ? [new mongoose.Types.ObjectId(staffId), staffId.toString()]
        : [staffId];

    // Bank account accounting codes for ledger banking entries
    const bankAccounts = await BankAccount.find({ isDeleted: { $ne: true } }).select("accountingCode").lean();
    const bankAccCodeIds = bankAccounts.map(b => b.accountingCode).filter(Boolean);

    // 1. Fetch Daily Work Done (Invoices, Bills, Debit/Credit Notes, Bank Tx, Uploads)
    const [
        invoices,
        bills,
        debitNotes,
        creditNotes,
        ledgerBankTx,
        directBankTx,
        systemUploads,
        activityLogs
    ] = await Promise.all([
        Invoice.find({ createdBy: { $in: staffIdVariants }, ...dateFilter, isDeleted: { $ne: true } })
            .select("invoiceNumber totalAmountDue total subtotal baseAmount invoiceType customer driver vehicle createdAt supportingDocument")
            .sort({ createdAt: -1 })
            .lean(),
        Bill.find({ createdBy: { $in: staffIdVariants }, ...dateFilter, isDeleted: { $ne: true } })
            .select("billNumber totalAmount balanceDue supplier billDate createdAt")
            .sort({ createdAt: -1 })
            .lean(),
        DebitNote.find({ createdBy: { $in: staffIdVariants }, ...dateFilter, isDeleted: { $ne: true } })
            .select("debitNoteNumber amount debitNoteDate status createdAt supportingDocument")
            .sort({ createdAt: -1 })
            .lean(),
        CreditNote.find({ createdBy: { $in: staffIdVariants }, ...dateFilter, isDeleted: { $ne: true } })
            .select("creditNoteNumber amount creditNoteDate status createdAt supportingDocument")
            .sort({ createdAt: -1 })
            .lean(),
        LedgerEntry.find({
            accountingCode: { $in: bankAccCodeIds },
            createdBy: { $in: staffIdVariants },
            ...dateFilter,
            isDeleted: { $ne: true }
        })
            .select("transactionId amount type description entryDate createdAt")
            .sort({ createdAt: -1 })
            .lean(),
        BankTransaction.find({ createdBy: { $in: staffIdVariants }, ...dateFilter })
            .select("transactionId amount type description entryDate createdAt")
            .sort({ createdAt: -1 })
            .lean(),
        SystemUpload.find({ uploadedBy: { $in: staffIdVariants }, ...dateFilter })
            .select("originalName fileUrl module fileSize mimeType entityReference createdAt notes status")
            .sort({ createdAt: -1 })
            .lean(),
        StaffActivityLog.find({ userId: { $in: staffIdVariants }, ...dateFilter })
            .sort({ createdAt: -1 })
            .limit(200)
            .lean()
    ]);

    const bankTransactions = [...ledgerBankTx, ...directBankTx];

    // 2. Synthesize Work Summary Metrics
    const workSummary = {
        invoicesCount: invoices.length,
        invoicesTotalAmount: invoices.reduce((sum, i) => sum + (i.totalAmountDue || i.total || i.subtotal || i.baseAmount || 0), 0),
        billsCount: bills.length,
        billsTotalAmount: bills.reduce((sum, b) => sum + (b.totalAmount || 0), 0),
        debitNotesCount: debitNotes.length,
        debitNotesTotalAmount: debitNotes.reduce((sum, d) => sum + (d.amount || 0), 0),
        creditNotesCount: creditNotes.length,
        creditNotesTotalAmount: creditNotes.reduce((sum, c) => sum + (c.amount || 0), 0),
        bankTransactionsCount: bankTransactions.length,
        bankTransactionsTotalAmount: bankTransactions.reduce((sum, t) => sum + (t.amount || 0), 0),
        uploadsCount: systemUploads.length,
        totalDailyWorkDone: invoices.length + bills.length + debitNotes.length + creditNotes.length + bankTransactions.length + systemUploads.length
    };

    // 3. Build Unified Chronological Audit History
    const seenEvents = new Set();
    const auditHistory = [];

    // Add logged events from StaffActivityLog
    for (const log of activityLogs) {
        const key = `${log.entityType}_${log.entityId || log.entityIdentifier}_${log.action}`;
        seenEvents.add(key);
        auditHistory.push({
            id: log._id,
            action: log.action,
            entityType: log.entityType,
            entityId: log.entityId,
            entityIdentifier: log.entityIdentifier || "—",
            amount: log.amount || 0,
            description: log.description || `${log.action} ${log.entityType}`,
            fileUrl: log.fileUrl || null,
            fileName: log.fileName || null,
            timestamp: log.timestamp || log.createdAt,
            metadata: log.metadata || {}
        });
    }

    // Include Invoices not already in activity log
    for (const inv of invoices) {
        const key = `INVOICE_${inv._id}_CREATE`;
        if (!seenEvents.has(key)) {
            seenEvents.add(key);
            auditHistory.push({
                id: inv._id,
                action: "CREATE",
                entityType: "INVOICE",
                entityId: inv._id,
                entityIdentifier: inv.invoiceNumber || `INV-${inv._id}`,
                amount: inv.total || inv.subtotal || 0,
                description: `Created Invoice ${inv.invoiceNumber} (${inv.invoiceType || "RENTAL"})`,
                fileUrl: inv.supportingDocument?.url || null,
                fileName: inv.supportingDocument?.name || null,
                timestamp: inv.createdAt
            });
        }
    }

    // Include Bills
    for (const b of bills) {
        const key = `BILL_${b._id}_CREATE`;
        if (!seenEvents.has(key)) {
            seenEvents.add(key);
            auditHistory.push({
                id: b._id,
                action: "CREATE",
                entityType: "BILL",
                entityId: b._id,
                entityIdentifier: b.billNumber || `BILL-${b._id}`,
                amount: b.totalAmount || 0,
                description: `Created Bill ${b.billNumber}`,
                fileUrl: null,
                fileName: null,
                timestamp: b.createdAt
            });
        }
    }

    // Include Debit Notes
    for (const dn of debitNotes) {
        const key = `DEBIT_NOTE_${dn._id}_CREATE`;
        if (!seenEvents.has(key)) {
            seenEvents.add(key);
            auditHistory.push({
                id: dn._id,
                action: "CREATE",
                entityType: "DEBIT_NOTE",
                entityId: dn._id,
                entityIdentifier: dn.debitNoteNumber,
                amount: dn.amount || 0,
                description: `Created Debit Note ${dn.debitNoteNumber}`,
                fileUrl: dn.supportingDocument?.url || null,
                fileName: dn.supportingDocument?.name || null,
                timestamp: dn.createdAt
            });
        }
    }

    // Include Credit Notes
    for (const cn of creditNotes) {
        const key = `CREDIT_NOTE_${cn._id}_CREATE`;
        if (!seenEvents.has(key)) {
            seenEvents.add(key);
            auditHistory.push({
                id: cn._id,
                action: "CREATE",
                entityType: "CREDIT_NOTE",
                entityId: cn._id,
                entityIdentifier: cn.creditNoteNumber,
                amount: cn.amount || 0,
                description: `Created Credit Note ${cn.creditNoteNumber}`,
                fileUrl: cn.supportingDocument?.url || null,
                fileName: cn.supportingDocument?.name || null,
                timestamp: cn.createdAt
            });
        }
    }

    // Include Bank Transactions
    for (const tx of bankTransactions) {
        const key = `BANK_TRANSACTION_${tx._id}_CREATE`;
        if (!seenEvents.has(key)) {
            seenEvents.add(key);
            auditHistory.push({
                id: tx._id,
                action: "CREATE",
                entityType: "BANK_TRANSACTION",
                entityId: tx._id,
                entityIdentifier: tx.transactionId || `TXN-${tx._id}`,
                amount: tx.amount || 0,
                description: tx.description || `Bank transaction: ${tx.type}`,
                fileUrl: null,
                fileName: null,
                timestamp: tx.createdAt || tx.entryDate
            });
        }
    }

    // Include System Uploads
    for (const up of systemUploads) {
        const key = `UPLOAD_${up._id}_UPLOAD`;
        if (!seenEvents.has(key)) {
            seenEvents.add(key);
            auditHistory.push({
                id: up._id,
                action: "UPLOAD",
                entityType: "UPLOAD",
                entityId: up._id,
                entityIdentifier: up.entityReference || up.originalName,
                amount: 0,
                description: `Uploaded file ${up.originalName} (${up.module})`,
                fileUrl: up.fileUrl,
                fileName: up.originalName,
                timestamp: up.createdAt
            });
        }
    }

    // Sort audit history descending by timestamp
    auditHistory.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    // 4. Generate Day-by-Day Daily Work Breakdown for Charts
    const dailyMap = {};
    const curr = new Date(start);
    while (curr <= end) {
        const dateStr = curr.toISOString().split("T")[0];
        dailyMap[dateStr] = {
            date: dateStr,
            invoices: 0,
            bills: 0,
            debitNotes: 0,
            creditNotes: 0,
            bankTransactions: 0,
            uploads: 0,
            total: 0
        };
        curr.setDate(curr.getDate() + 1);
    }

    const populateDaily = (items, key) => {
        for (const item of items) {
            const dateStr = new Date(item.createdAt || item.timestamp).toISOString().split("T")[0];
            if (dailyMap[dateStr]) {
                dailyMap[dateStr][key] += 1;
                dailyMap[dateStr].total += 1;
            }
        }
    };

    populateDaily(invoices, "invoices");
    populateDaily(bills, "bills");
    populateDaily(debitNotes, "debitNotes");
    populateDaily(creditNotes, "creditNotes");
    populateDaily(bankTransactions, "bankTransactions");
    populateDaily(systemUploads, "uploads");

    const dailyWorkBreakdown = Object.values(dailyMap);

    // 5. Existing Task Stats & Salary/Payroll
    const taskFilter = {
        assignedTo: staffObjectId,
        createdAt: { $gte: start, $lte: end }
    };
    const tasks = await Task.find(taskFilter).sort({ createdAt: -1 }).lean();
    const taskStats = {
        total: tasks.length,
        completed: tasks.filter(t => t.status === "COMPLETED").length,
        pending: tasks.filter(t => t.status !== "COMPLETED").length,
    };

    const salaryStructure = await SalaryStructure.findOne({ staffId, staffRole: role }).lean();
    const salaryPayments = await SalaryPayment.find({ staffId, staffRole: role }).sort({ year: -1, month: -1 }).limit(12).lean();

    const attendance = (staff.loginHistory || [])
        .filter(log => {
            const loginDate = new Date(log.loginTime);
            return loginDate >= start && loginDate <= end;
        })
        .sort((a, b) => new Date(b.loginTime) - new Date(a.loginTime));

    const hierarchy = {
        branch: staff.branchId || null,
        manager: null
    };

    if (role !== ROLES.BRANCHMANAGER && staff.branchId) {
        hierarchy.manager = await BranchManager.findOne({ branchId: staff.branchId._id || staff.branchId, isDeleted: false }).select("fullName email phone").lean();
    }

    // Role-specific driver/vehicle onboarding
    const roleAnalytics = {};
    if (role === ROLES.FINANCESTAFF) {
        roleAnalytics.driversOnboarded = await Driver.countDocuments({ 
            "statusHistory": { 
                $elemMatch: { 
                    status: "ACTIVE", 
                    changedBy: staffObjectId,
                    timestamp: { $gte: start, $lte: end }
                } 
            } 
        });
    } else if (role === ROLES.OPERATIONSTAFF) {
        roleAnalytics.vehiclesProcessed = await Vehicle.countDocuments({
            "statusHistory": {
                $elemMatch: {
                    status: { $regex: /^ACTIVE/ },
                    changedBy: staffObjectId,
                    timestamp: { $gte: start, $lte: end }
                }
            }
        });
    }

    return {
        profile: {
            _id: staff._id,
            fullName: staff.fullName,
            email: staff.email,
            phone: staff.phone,
            role: role,
            status: staff.status,
            avatar: staff.fullName ? staff.fullName.charAt(0) : "U",
            createdAt: staff.createdAt,
            lastLoginAt: staff.lastLoginAt
        },
        workSummary,
        dailyWorkBreakdown,
        auditHistory,
        performance: {
            taskStats,
            tasks: tasks.slice(0, 10),
            successRate: taskStats.total > 0 ? Math.round((taskStats.completed / taskStats.total) * 100) : 0
        },
        payroll: {
            structure: salaryStructure,
            history: salaryPayments
        },
        attendance,
        hierarchy,
        roleAnalytics
    };
};

exports.getStaffAuditTrailRepo = async (staffId, options = {}) => {
    const { startDate, endDate, entityType, action, limit = 100, page = 1 } = options;
    const staffIdVariants = mongoose.Types.ObjectId.isValid(staffId)
        ? [new mongoose.Types.ObjectId(staffId), staffId.toString()]
        : [staffId];

    const query = { userId: { $in: staffIdVariants } };
    if (startDate || endDate) {
        query.createdAt = {};
        if (startDate) query.createdAt.$gte = new Date(startDate);
        if (endDate) {
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999);
            query.createdAt.$lte = end;
        }
    }
    if (entityType && entityType !== "ALL") query.entityType = entityType;
    if (action && action !== "ALL") query.action = action;

    const skip = (Number(page) - 1) * Number(limit);
    const [logs, total] = await Promise.all([
        StaffActivityLog.find(query)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(Number(limit))
            .lean(),
        StaffActivityLog.countDocuments(query)
    ]);

    return {
        logs,
        pagination: {
            total,
            page: Number(page),
            limit: Number(limit),
            pages: Math.ceil(total / Number(limit))
        }
    };
};
