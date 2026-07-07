
const mongoose = require("mongoose");
const Branch = require("../Model/BranchModel.js");
/**
 * Creates a new branch in the database.
 * @param {Object} branchData - The payload containing branch details.
 * @param {string} branchData.name - The name of the branch.
 * @param {string} branchData.code - Branch code.
 * @param {string} branchData.address - Branch address.
 * @param {string} branchData.city - City of the branch.
 * @param {string} branchData.state - State of the branch.
 * @param {string} branchData.phone - Contact phone number.
 * @returns {Promise<Object>} The newly created Branch document.
 */
exports.addBranchService = async (branchData) => {
    try {
        // Simulate adding branch to the database
        const newBranch = await Branch.create(branchData);
        return newBranch;
    } catch (error) {
        throw error;
    }
}

/**
 * Updates an existing branch in the database.
 * @param {Object} branchData - The payload containing updated branch fields including the branch `id`.
 * @returns {Promise<Object>} The updated Branch document.
 */
exports.editBranchService = async (branchData) => {
    try {
        const { id, ...updateData } = branchData;
        const updatedBranch = await Branch.findByIdAndUpdate(id, updateData, { new: true });
        return updatedBranch;
    } catch (error) {
        throw error;
    }
}

/**
 * Soft deletes a branch by marking it as deleted.
 * @param {string} branchId - The ID of the branch to delete.
 * @returns {Promise<void>}
 */
exports.deleteBranchService = async (branchId) => {
    try {
        await Branch.findByIdAndUpdate(branchId, { isDeleted: true });
    } catch (error) {
        throw error;
    }
}

const { applyQueryFeatures } = require("../../../shared/utils/queryHelper");
require("../../BranchManager/Model/BranchManagerModel.js");
const OperationStaff = require("../../OperationStaff/Model/OperationStaffModel.js");
const WorkshopStaff = require("../../WorkshopStaff/Model/WorkshopStaffModel.js");
const FinanceStaff = require("../../FinanceStaff/Model/FinanceStaffModel.js");
const WorkshopManager = require("../../WorkshopManager/Model/WorkshopManagerModel.js");
const { Driver } = require("../../Driver/Model/DriverModel.js");
const { Vehicle } = require("../../Vehicle/Model/VehicleModel.js");
const Task = require("../../StaffPerformance/Model/TaskModel.js");

/**
 * Retrieves all branches using generic query features.
 * @param {Object} queryParams - Raw query parameters from req.query.
 * @param {Object} [options={}] - Additional options like baseQuery.
 * @returns {Promise<Object>} Paginated result
 */
exports.getBranchesService = async (queryParams = {}, options = {}) => {
    try {
        const queryOptions = {
            searchFields: ["name", "code", "city", "state"],
            filterFields: ["status", "country", "type"],
            dateFilterField: "createdAt",
            populate: [
                { path: "countryManager", select: "fullName country" },
                { path: "branchManager" }
            ],
            ...options
        };

        const result = await applyQueryFeatures(Branch, queryParams, queryOptions);
        console.log(`[DEBUG] getBranchesService returning ${result.data.length} branches. First branch manager:`, result.data[0]?.branchManager);
        return result;
    } catch (error) {
        throw error;
    }
};

/**
 * Retrieves a single branch by ID.
 * @param {string} branchId - The ID of the branch.
 * @returns {Promise<Object>} The branch document.
 */
exports.getBranchByIdService = async (branchId) => {
    try {
        const branch = await Branch.findById(branchId).populate([
            { path: "countryManager", select: "fullName country" },
            { path: "branchManager" }
        ]);
        if (!branch) return null;

        return branch;
    } catch (error) {
        throw error;
    }
}

/**
 * Retrieves extended branch details including staff counts and analytics.
 * @param {string} branchId - The ID of the branch.
 * @param {Object} filters - Optional filters like startDate, endDate.
 * @returns {Promise<Object>} Extended branch details.
 */
exports.getBranchExtendedDetailsRepo = async (branchId, filters = {}) => {
    try {
        const branch = await Branch.findById(branchId).populate([
            { path: "countryManager", select: "fullName country" },
            { path: "branchManager" }
        ]);

        if (!branch) return null;

        const { startDate, endDate } = filters;
        const dateFilter = {};
        if (startDate && endDate) {
            dateFilter.createdAt = {
                $gte: new Date(startDate),
                $lte: new Date(endDate)
            };
        }

        // Fetch counts for all staff types
        const [
            opStaffCount,
            wsStaffCount,
            finStaffCount,
            wsManagerCount,
            driverCount
        ] = await Promise.all([
            OperationStaff.countDocuments({ branchId, isDeleted: false }),
            WorkshopStaff.countDocuments({ branchId, isDeleted: false }),
            FinanceStaff.countDocuments({ branchId, isDeleted: false }),
            WorkshopManager.countDocuments({ branchId, isDeleted: false }),
            Driver.countDocuments({ branchId, isDeleted: false })
        ]);

        // Fetch all staff members for individual analytics
        const [
            opStaffs,
            wsStaffs,
            finStaffs,
            wsManagers
        ] = await Promise.all([
            OperationStaff.find({ branchId, isDeleted: false }).select("fullName email phone status role"),
            WorkshopStaff.find({ branchId, isDeleted: false }).select("fullName email phone status role"),
            FinanceStaff.find({ branchId, isDeleted: false }).select("fullName email phone status role"),
            WorkshopManager.find({ branchId, isDeleted: false }).select("fullName email phone status role")
        ]);

        const allStaff = [...opStaffs, ...wsStaffs, ...finStaffs, ...wsManagers];

        // ─── NEW ANALYTICS: Drivers & Vehicles ─────────────────────────
        const [
            driversOnboarded,
            activeDrivers,
            activeVehicles,
            onboardingTrends
        ] = await Promise.all([
            Driver.countDocuments({ branch: branchId, isDeleted: false, createdAt: dateFilter.createdAt || { $exists: true } }),
            Driver.countDocuments({ branch: branchId, isDeleted: false, status: "ACTIVE" }),
            Vehicle.countDocuments({ "purchaseDetails.branch": branchId, isDeleted: false, status: { $regex: /^ACTIVE/ } }),
            Driver.aggregate([
                { 
                    $match: { 
                        branch: new mongoose.Types.ObjectId(branchId), 
                        isDeleted: false,
                        createdAt: dateFilter.createdAt || { $exists: true }
                    } 
                },
                {
                    $group: {
                        _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
                        count: { $sum: 1 }
                    }
                },
                { $sort: { _id: 1 } }
            ])
        ]);

        // Aggregate analytics for these staff members within the date range
        const staffIds = allStaff.map(s => s._id);
        const taskStats = await Task.aggregate([
            {
                $match: {
                    assignedTo: { $in: staffIds },
                    createdAt: dateFilter.createdAt || { $exists: true }
                }
            },
            {
                $group: {
                    _id: "$assignedTo",
                    totalTasks: { $sum: 1 },
                    completedTasks: {
                        $sum: { $cond: [{ $eq: ["$status", "COMPLETED"] }, 1, 0] }
                    },
                    pendingTasks: {
                        $sum: { $cond: [{ $eq: ["$status", "PENDING"] }, 1, 0] }
                    }
                }
            }
        ]);

        // Map task stats back to staff objects
        const staffWithAnalytics = allStaff.map(staff => {
            const stats = taskStats.find(ts => ts._id.toString() === staff._id.toString()) || {
                totalTasks: 0,
                completedTasks: 0,
                pendingTasks: 0
            };
            return {
                ...staff.toObject(),
                analytics: stats
            };
        });

        // Overall Branch Analytics
        const overallAnalytics = {
            totalStaff: opStaffCount + wsStaffCount + finStaffCount + wsManagerCount + driverCount,
            staffBreakdown: {
                operation: opStaffCount,
                workshop: wsStaffCount,
                finance: finStaffCount,
                workshopManager: wsManagerCount,
                driver: driverCount
            },
            taskSummary: {
                total: taskStats.reduce((acc, curr) => acc + curr.totalTasks, 0),
                completed: taskStats.reduce((acc, curr) => acc + curr.completedTasks, 0),
                pending: taskStats.reduce((acc, curr) => acc + curr.pendingTasks, 0)
            },
            driverStats: {
                onboarded: driversOnboarded,
                active: activeDrivers,
                trends: onboardingTrends
            },
            vehicleStats: {
                active: activeVehicles
            }
        };

        return {
            branch,
            staff: staffWithAnalytics,
            analytics: overallAnalytics
        };
    } catch (error) {
        throw error;
    }
};
