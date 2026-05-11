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
const Task = require("../Model/TaskModel");
const Target = require("../Model/TargetModel");
const SalaryStructure = require("../../Salary/Model/SalaryStructureModel");
const SalaryPayment = require("../../Salary/Model/SalaryPaymentModel");
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
    ];

    for (const { model, role } of collections) {
        let query = model.findById(id).lean();
        if (model.schema.path("branchId")) {
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

    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    const dateFilter = {
        createdAt: { $gte: start, $lte: end }
    };

    const taskFilter = {
        assignedTo: new mongoose.Types.ObjectId(staffId),
        createdAt: { $gte: start, $lte: end }
    };

    // 1. Fetch Performance Metrics (Tasks)
    const tasks = await Task.find(taskFilter).sort({ createdAt: -1 }).lean();
    const taskStats = {
        total: tasks.length,
        completed: tasks.filter(t => t.status === "COMPLETED").length,
        pending: tasks.filter(t => t.status !== "COMPLETED").length,
    };

    // 2. Fetch Salary/Payroll Details
    const salaryStructure = await SalaryStructure.findOne({ staffId, staffRole: role }).lean();
    const salaryPayments = await SalaryPayment.find({ staffId, staffRole: role }).sort({ year: -1, month: -1 }).limit(12).lean();

    // 3. Attendance Details (Login/Logout History)
    // Filter login history within date range if possible, otherwise show recent
    const attendance = (staff.loginHistory || [])
        .filter(log => {
            const loginDate = new Date(log.loginTime);
            return loginDate >= start && loginDate <= end;
        })
        .sort((a, b) => new Date(b.loginTime) - new Date(a.loginTime));

    // 4. Hierarchy & Branch
    const hierarchy = {
        branch: staff.branchId || null,
        // Reporting: Find the branch manager if not themselves
        manager: null
    };

    if (role !== ROLES.BRANCHMANAGER && staff.branchId) {
        hierarchy.manager = await BranchManager.findOne({ branchId: staff.branchId._id || staff.branchId, isDeleted: false }).select("fullName email phone").lean();
    }

    // 5. Role-Specific Analytics
    const roleAnalytics = {};
    if (role === ROLES.FINANCESTAFF) {
        // Finance: Drivers brought to active
        roleAnalytics.driversOnboarded = await Driver.countDocuments({ 
            "statusHistory": { 
                $elemMatch: { 
                    status: "ACTIVE", 
                    changedBy: new mongoose.Types.ObjectId(staffId),
                    timestamp: { $gte: start, $lte: end }
                } 
            } 
        });
    } else if (role === ROLES.OPERATIONSTAFF) {
        // Ops: Vehicles brought to active
        roleAnalytics.vehiclesProcessed = await Vehicle.countDocuments({
            "statusHistory": {
                $elemMatch: {
                    status: { $regex: /^ACTIVE/ },
                    changedBy: new mongoose.Types.ObjectId(staffId),
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
            avatar: staff.fullName.charAt(0),
            createdAt: staff.createdAt,
            lastLoginAt: staff.lastLoginAt
        },
        performance: {
            taskStats,
            tasks: tasks.slice(0, 10), // Recent tasks
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
