const mongoose = require("mongoose");
const { Driver } = require("../../Driver/Model/DriverModel");
const { Vehicle } = require("../../Vehicle/Model/VehicleModel");
const FinanceStaff = require("../../FinanceStaff/Model/FinanceStaffModel");
const OperationStaff = require("../../OperationStaff/Model/OperationStaffModel");
const BranchManager = require("../../BranchManager/Model/BranchManagerModel");
const CountryManager = require("../../CountryManager/Model/CountryManagerModel");
const Branch = require("../../Branch/Model/BranchModel");
const Admin = require("../../Admin/model/adminModel");
const FinanceAdmin = require("../../FinanceAdmin/model/FinanceAdminModel");
const OperationAdmin = require("../../OperationAdmin/model/OperationAdminModel");
const Target = require("../Model/TargetModel");
const Lease = require("../../Lease/Model/LeaseModel");
const { Invoice } = require("../../Invoice/Model/InvoiceModel");
const Bill = require("../../Bill/Model/BillModel");
const DebitNote = require("../../DebitNote/Model/DebitNoteModel");
const CreditNote = require("../../CreditNote/Model/CreditNoteModel");
const BankTransaction = require("../../BankAccount/Model/BankTransactionModel");
const LedgerEntry = require("../../Ledger/Model/LedgerEntryModel");
const BankAccount = require("../../BankAccount/Model/BankAccountModel");
const SystemUpload = require("../Model/SystemUploadModel");
const StaffActivityLog = require("../Model/StaffActivityLogModel");
const { getStaffDetailsRepo, getStaffAuditTrailRepo } = require("../Repo/StaffPerformanceRepo");

/**
 * Aggregates performance metrics for finance and operation staff
 * by cross-referencing Driver/Vehicle statusHistory records.
 */
const getStaffPerformance = async (filters = {}) => {
    const { branchId, country, type = "all", startDate, endDate } = filters;
    let branchIds = branchId ? [branchId] : null;

    // If country is provided but no specific branch, get all branches for that country
    if (country && !branchId) {
        const countryBranches = await Branch.find({ country, isDeleted: false }).select("_id").lean();
        branchIds = countryBranches.map(b => b._id.toString());
    }

    const now = new Date();
    const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);

    // Timeline match logic for performance calculations
    const timelineMatch = {};
    if (startDate || endDate) {
        if (startDate) timelineMatch.$gte = new Date(startDate);
        if (endDate) {
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999);
            timelineMatch.$lte = end;
        }
    }

    const result = { financeStaff: [], operationStaff: [], branchManagers: [], countryManagers: [], globalAdmins: [] };

    // ─── Finance Staff (Driver Onboarding) ────────────────────────
    if (type === "all" || type === "finance") {
        const staffQuery = { isDeleted: false };
        if (branchIds) staffQuery.branchId = { $in: branchIds };

        const finStaff = await FinanceStaff.find(staffQuery)
            .select("-passwordHash -refreshToken -failedLoginAttempts -lockUntil")
            .populate("branchId", "name code")
            .lean();

        // Get all driver statusHistory entries attributed to finance staff
        const driverAgg = await Driver.aggregate([
            { $match: { isDeleted: false } },
            { $unwind: "$statusHistory" },
            {
                $match: {
                    "statusHistory.changedByRole": "FINANCESTAFF",
                    "statusHistory.changedBy": { $in: finStaff.map(s => s._id) },
                    ...(Object.keys(timelineMatch).length > 0 ? { "statusHistory.timestamp": timelineMatch } : {})
                },
            },
            {
                $group: {
                    _id: "$statusHistory.changedBy",
                    totalActions: { $sum: 1 },
                    actionsThisWeek: {
                        $sum: { $cond: [{ $gte: ["$statusHistory.timestamp", weekAgo] }, 1, 0] },
                    },
                    actionsThisMonth: {
                        $sum: { $cond: [{ $gte: ["$statusHistory.timestamp", monthAgo] }, 1, 0] },
                    },
                    stages: { $push: "$statusHistory.status" },
                    timestamps: { $push: "$statusHistory.timestamp" },
                    // Count unique drivers where they performed any action
                    driverIds: { $addToSet: "$_id" },
                    // Count drivers they brought to ACTIVE
                    activeDriverIds: {
                        $addToSet: {
                            $cond: [{ $eq: ["$statusHistory.status", "ACTIVE"] }, "$_id", "$$REMOVE"],
                        },
                    },
                    recentActions: {
                        $push: {
                            driverId: "$_id",
                            driverName: "$personalInfo.fullName",
                            status: "$statusHistory.status",
                            timestamp: "$statusHistory.timestamp",
                            notes: "$statusHistory.notes",
                        },
                    },
                },
            },
        ]);

        // Map aggregation results to staff
        const driverMetricsMap = {};
        for (const entry of driverAgg) {
            driverMetricsMap[entry._id.toString()] = entry;
        }

        for (const staff of finStaff) {
            const metrics = driverMetricsMap[staff._id.toString()];

            // Build stage breakdown
            const stageBreakdown = {};
            if (metrics?.stages) {
                for (const stage of metrics.stages) {
                    stageBreakdown[stage] = (stageBreakdown[stage] || 0) + 1;
                }
            }

            // Calculate avg time per stage (simplified: avg gap between consecutive timestamps)
            let avgTimePerStageHours = 0;
            if (metrics?.timestamps && metrics.timestamps.length > 1) {
                const sorted = [...metrics.timestamps].sort((a, b) => a - b);
                let totalGap = 0;
                for (let i = 1; i < sorted.length; i++) {
                    totalGap += sorted[i] - sorted[i - 1];
                }
                avgTimePerStageHours = Math.round((totalGap / (sorted.length - 1) / 3600000) * 10) / 10;
            }

            // Get recent activity (last 10)
            const recentActivity = (metrics?.recentActions || [])
                .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
                .slice(0, 10);

            result.financeStaff.push({
                staffId: staff._id,
                fullName: staff.fullName,
                email: staff.email,
                phone: staff.phone,
                branchId: staff.branchId?._id || staff.branchId,
                branchName: staff.branchId?.name || "Unknown",
                status: staff.status,
                lastLoginAt: staff.lastLoginAt,
                createdAt: staff.createdAt,
                metrics: {
                    totalDriversOnboarded: metrics?.activeDriverIds?.length || 0,
                    totalDriversTouched: metrics?.driverIds?.length || 0,
                    totalStageActions: metrics?.totalActions || 0,
                    actionsThisWeek: metrics?.actionsThisWeek || 0,
                    actionsThisMonth: metrics?.actionsThisMonth || 0,
                    avgTimePerStageHours,
                    stageBreakdown,
                },
                recentActivity,
            });
        }
    }

    // ─── Operation Staff (Vehicle Onboarding) ─────────────────────
    if (type === "all" || type === "operation") {
        const staffQuery = { isDeleted: false };
        if (branchIds) staffQuery.branchId = { $in: branchIds };

        const opStaff = await OperationStaff.find(staffQuery)
            .select("-passwordHash -refreshToken -failedLoginAttempts -lockUntil")
            .populate("branchId", "name code")
            .lean();

        // Get all vehicle statusHistory entries attributed to operation staff
        const vehicleAgg = await Vehicle.aggregate([
            { $match: { isDeleted: false } },
            { $unwind: "$statusHistory" },
            {
                $match: {
                    "statusHistory.changedByRole": "OPERATIONSTAFF",
                    "statusHistory.changedBy": { $in: opStaff.map(s => s._id) },
                    ...(Object.keys(timelineMatch).length > 0 ? { "statusHistory.timestamp": timelineMatch } : {})
                },
            },
            {
                $group: {
                    _id: "$statusHistory.changedBy",
                    totalActions: { $sum: 1 },
                    actionsThisWeek: {
                        $sum: { $cond: [{ $gte: ["$statusHistory.timestamp", weekAgo] }, 1, 0] },
                    },
                    actionsThisMonth: {
                        $sum: { $cond: [{ $gte: ["$statusHistory.timestamp", monthAgo] }, 1, 0] },
                    },
                    stages: { $push: "$statusHistory.status" },
                    timestamps: { $push: "$statusHistory.timestamp" },
                    vehicleIds: { $addToSet: "$_id" },
                    activeVehicleIds: {
                        $addToSet: {
                            $cond: [
                                { $in: ["$statusHistory.status", ["ACTIVE — AVAILABLE", "ACTIVE — RENTED", "W. GROUP ACTIVE"]] },
                                "$_id",
                                "$$REMOVE",
                            ],
                        },
                    },
                    recentActions: {
                        $push: {
                            vehicleId: "$_id",
                            vehicleName: {
                                $concat: [
                                    { $ifNull: ["$basicDetails.make", ""] },
                                    " ",
                                    { $ifNull: ["$basicDetails.model", ""] },
                                ],
                            },
                            status: "$statusHistory.status",
                            timestamp: "$statusHistory.timestamp",
                            notes: "$statusHistory.notes",
                        },
                    },
                },
            },
        ]);

        const vehicleMetricsMap = {};
        for (const entry of vehicleAgg) {
            vehicleMetricsMap[entry._id.toString()] = entry;
        }

        for (const staff of opStaff) {
            const metrics = vehicleMetricsMap[staff._id.toString()];

            const stageBreakdown = {};
            if (metrics?.stages) {
                for (const stage of metrics.stages) {
                    stageBreakdown[stage] = (stageBreakdown[stage] || 0) + 1;
                }
            }

            let avgTimePerStageHours = 0;
            if (metrics?.timestamps && metrics.timestamps.length > 1) {
                const sorted = [...metrics.timestamps].sort((a, b) => a - b);
                let totalGap = 0;
                for (let i = 1; i < sorted.length; i++) {
                    totalGap += sorted[i] - sorted[i - 1];
                }
                avgTimePerStageHours = Math.round((totalGap / (sorted.length - 1) / 3600000) * 10) / 10;
            }

            const recentActivity = (metrics?.recentActions || [])
                .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
                .slice(0, 10);

            result.operationStaff.push({
                staffId: staff._id,
                fullName: staff.fullName,
                email: staff.email,
                phone: staff.phone,
                branchId: staff.branchId?._id || staff.branchId,
                branchName: staff.branchId?.name || "Unknown",
                status: staff.status,
                lastLoginAt: staff.lastLoginAt,
                createdAt: staff.createdAt,
                metrics: {
                    totalVehiclesOnboarded: metrics?.activeVehicleIds?.length || 0,
                    totalVehiclesTouched: metrics?.vehicleIds?.length || 0,
                    totalStageActions: metrics?.totalActions || 0,
                    actionsThisWeek: metrics?.actionsThisWeek || 0,
                    actionsThisMonth: metrics?.actionsThisMonth || 0,
                    avgTimePerStageHours,
                    stageBreakdown,
                },
                recentActivity,
            });
        }
    }

    // ─── Branch Manager (Branch-level Aggregation) ───────────────────
    if (type === "all" || type === "branch-manager") {
        const managerQuery = { isDeleted: false };
        if (branchIds) managerQuery.branchId = { $in: branchIds };

        const managers = await BranchManager.find(managerQuery)
            .select("-passwordHash -refreshToken -failedLoginAttempts -lockUntil")
            .populate("branchId", "name code")
            .lean();

        // Get total active drivers and vehicles assigned to each branch
        // For Drivers
        const driverAggr = await Driver.aggregate([
            { $match: { isDeleted: false } },
            { $group: { _id: "$branch", totalDrivers: { $sum: 1 }, activeDrivers: { $sum: { $cond: [{ $eq: ["$status", "ACTIVE"] }, 1, 0] } } } }
        ]);
        const bDrivers = {};
        for (let d of driverAggr) { if (d._id) bDrivers[d._id.toString()] = d; }

        // For Vehicles
        const vehicleAggr = await Vehicle.aggregate([
            { $match: { isDeleted: false } },
            { $group: { _id: "$purchaseDetails.branch", totalVehicles: { $sum: 1 }, activeVehicles: { $sum: { $cond: [{ $in: ["$status", ["ACTIVE — AVAILABLE", "ACTIVE — RENTED", "W. GROUP ACTIVE"]] }, 1, 0] } } } }
        ]);
        const bVehicles = {};
        for (let v of vehicleAggr) { if (v._id) bVehicles[v._id.toString()] = v; }

        for (const manager of managers) {
            const mBranchId = manager.branchId?._id?.toString() || manager.branchId?.toString();

            // Re-format login history into a recent timeline
            const recentActivity = (manager.loginHistory || [])
                .map(login => ({
                    status: 'LOGGED IN',
                    timestamp: login.loginTime,
                    notes: `IP: ${login.ipAddress || 'Unknown'}`
                }))
                .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
                .slice(0, 10);

            result.branchManagers.push({
                staffId: manager._id,
                fullName: manager.fullName,
                email: manager.email,
                phone: manager.phone,
                branchId: manager.branchId?._id || manager.branchId,
                branchName: manager.branchId?.name || "Unknown",
                status: manager.status,
                lastLoginAt: manager.lastLoginAt,
                createdAt: manager.createdAt,
                metrics: {
                    totalBranchDrivers: bDrivers[mBranchId]?.totalDrivers || 0,
                    activeBranchDrivers: bDrivers[mBranchId]?.activeDrivers || 0,
                    totalBranchVehicles: bVehicles[mBranchId]?.totalVehicles || 0,
                    activeBranchVehicles: bVehicles[mBranchId]?.activeVehicles || 0,
                },
                recentActivity,
            });
        }
    }

    // ─── Country Manager (Country-level Aggregation) ───────────────────
    if (type === "all" || type === "country-manager") {
        const managerQuery = { isDeleted: false };
        if (filters.country) managerQuery.country = filters.country;

        const managers = await CountryManager.find(managerQuery)
            .select("-passwordHash -refreshToken -failedLoginAttempts -lockUntil")
            .lean();

        // Need to relate countries to branches
        // get a map of country -> array of branch IDs
        const branches = await Branch.find({ isDeleted: false }).select("_id country").lean();

        const bMap = {}; // branchId string -> country string
        const cMap = {}; // country string -> array of branchIds
        for (const b of branches) {
            const bId = b._id.toString();
            const bCountry = b.country;
            bMap[bId] = bCountry;
            if (!cMap[bCountry]) cMap[bCountry] = [];
            cMap[bCountry].push(b._id);
        }

        // Get total active drivers and vehicles assigned to each branch, then group by country
        // For Drivers
        const driverAggr = await Driver.aggregate([
            { $match: { isDeleted: false } },
            { $group: { _id: "$branch", totalDrivers: { $sum: 1 }, activeDrivers: { $sum: { $cond: [{ $eq: ["$status", "ACTIVE"] }, 1, 0] } } } }
        ]);
        const cDrivers = {};
        for (let d of driverAggr) {
            if (d._id) {
                const country = bMap[d._id.toString()];
                if (country) {
                    if (!cDrivers[country]) cDrivers[country] = { totalDrivers: 0, activeDrivers: 0 };
                    cDrivers[country].totalDrivers += d.totalDrivers;
                    cDrivers[country].activeDrivers += d.activeDrivers;
                }
            }
        }

        // For Vehicles
        const vehicleAggr = await Vehicle.aggregate([
            { $match: { isDeleted: false } },
            { $group: { _id: "$purchaseDetails.branch", totalVehicles: { $sum: 1 }, activeVehicles: { $sum: { $cond: [{ $in: ["$status", ["ACTIVE — AVAILABLE", "ACTIVE — RENTED", "W. GROUP ACTIVE"]] }, 1, 0] } } } }
        ]);
        const cVehicles = {};
        for (let v of vehicleAggr) {
            if (v._id) {
                const country = bMap[v._id.toString()];
                if (country) {
                    if (!cVehicles[country]) cVehicles[country] = { totalVehicles: 0, activeVehicles: 0 };
                    cVehicles[country].totalVehicles += v.totalVehicles;
                    cVehicles[country].activeVehicles += v.activeVehicles;
                }
            }
        }

        for (const manager of managers) {
            const mCountry = manager.country;

            // Re-format login history into a recent timeline
            const recentActivity = (manager.loginHistory || [])
                .map(login => ({
                    status: 'LOGGED IN',
                    timestamp: login.loginTime,
                    notes: `IP: ${login.ipAddress || 'Unknown'}`
                }))
                .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
                .slice(0, 10);

            result.countryManagers.push({
                staffId: manager._id,
                fullName: manager.fullName,
                email: manager.email,
                phone: manager.phone,
                country: manager.country,
                status: manager.status,
                lastLoginAt: manager.lastLoginAt,
                createdAt: manager.createdAt,
                metrics: {
                    totalCountryBranches: cMap[mCountry]?.length || 0,
                    totalCountryDrivers: cDrivers[mCountry]?.totalDrivers || 0,
                    activeCountryDrivers: cDrivers[mCountry]?.activeDrivers || 0,
                    totalCountryVehicles: cVehicles[mCountry]?.totalVehicles || 0,
                    activeCountryVehicles: cVehicles[mCountry]?.activeVehicles || 0,
                },
                recentActivity,
            });
        }
    }

    // ─── Global Admins (Global-level Aggregation) ───────────────────
    if (type === "all" || type === "finance-admin" || type === "operation-admin") {
        // Calculate Global Totals Once
        const globalBranchesCount = await Branch.countDocuments({ isDeleted: false });

        const driverAggr = await Driver.aggregate([
            { $match: { isDeleted: false } },
            { $group: { _id: null, totalDrivers: { $sum: 1 }, activeDrivers: { $sum: { $cond: [{ $eq: ["$status", "ACTIVE"] }, 1, 0] } } } }
        ]);
        const globalDrivers = driverAggr[0] || { totalDrivers: 0, activeDrivers: 0 };

        const vehicleAggr = await Vehicle.aggregate([
            { $match: { isDeleted: false } },
            { $group: { _id: null, totalVehicles: { $sum: 1 }, activeVehicles: { $sum: { $cond: [{ $in: ["$status", ["ACTIVE — AVAILABLE", "ACTIVE — RENTED", "W. GROUP ACTIVE"]] }, 1, 0] } } } }
        ]);
        const globalVehicles = vehicleAggr[0] || { totalVehicles: 0, activeVehicles: 0 };

        const pushAdminMetrics = (admin, roleType) => {
            const recentActivity = (admin.loginHistory || [])
                .map(login => ({
                    status: 'LOGGED IN',
                    timestamp: login.loginTime,
                    notes: `IP: ${login.ipAddress || 'Unknown'}`
                }))
                .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
                .slice(0, 10);

            result.globalAdmins.push({
                staffId: admin._id,
                fullName: admin.fullName,
                email: admin.email,
                phone: admin.phone || 'N/A',
                role: roleType,
                status: admin.status,
                lastLoginAt: admin.lastLoginAt,
                createdAt: admin.createdAt,
                metrics: {
                    totalGlobalBranches: globalBranchesCount,
                    totalGlobalDrivers: globalDrivers.totalDrivers,
                    activeGlobalDrivers: globalDrivers.activeDrivers,
                    totalGlobalVehicles: globalVehicles.totalVehicles,
                    activeGlobalVehicles: globalVehicles.activeVehicles,
                },
                recentActivity,
            });
        };

        if (type === "all" || type === "admin") {
            const rootAdmins = await Admin.find({ isDeleted: false }).select("-passwordHash -refreshToken -failedLoginAttempts -lockUntil").lean();
            rootAdmins.forEach(admin => pushAdminMetrics(admin, 'admin'));
        }

        if (type === "all" || type === "finance-admin") {
            const fAdmins = await FinanceAdmin.find({ isDeleted: false }).select("-passwordHash -refreshToken -failedLoginAttempts -lockUntil").lean();
            fAdmins.forEach(admin => pushAdminMetrics(admin, 'finance-admin'));
        }

        if (type === "all" || type === "operation-admin") {
            const oAdmins = await OperationAdmin.find({ isDeleted: false }).select("-passwordHash -refreshToken -failedLoginAttempts -lockUntil").lean();
            oAdmins.forEach(admin => pushAdminMetrics(admin, 'operation-admin'));
        }
    }

    // ─── Target Comparison & Hierarchy Mapping ───────────────────
    const targetQuery = {};
    if (filters.country) {
        targetQuery.targetType = "COUNTRY";
        targetQuery.targetId = filters.country;
    } else if (filters.branchId) {
        targetQuery.targetType = "BRANCH";
        targetQuery.targetId = filters.branchId;
    }

    if (Object.keys(timelineMatch).length > 0) {
        targetQuery.startDate = timelineMatch;
    }

    const targets = await Target.find(targetQuery).lean();

    // Calculate Actuals for the period
    const actuals = {
        DRIVER_ACQUISITION: 0,
        VEHICLE_ACQUISITION: 0,
        RENTAL: 0
    };

    // Driver Acquisition Actual
    const driverActualAgg = await Driver.aggregate([
        { $match: { isDeleted: false } },
        { $unwind: "$statusHistory" },
        {
            $lookup: {
                from: "branches",
                localField: "branch",
                foreignField: "_id",
                as: "branchDetails"
            }
        },
        { $unwind: "$branchDetails" },
        {
            $match: {
                "statusHistory.status": "ACTIVE",
                ...(Object.keys(timelineMatch).length > 0 ? { "statusHistory.timestamp": timelineMatch } : {}),
                ...(filters.branchId ? { branch: new mongoose.Types.ObjectId(filters.branchId) } : {}),
                ...(filters.country ? { "branchDetails.country": filters.country } : {})
            }
        },
        { $group: { _id: null, count: { $sum: 1 } } }
    ]);
    actuals.DRIVER_ACQUISITION = driverActualAgg[0]?.count || 0;

    // Vehicle Acquisition Actual
    const vehicleActualAgg = await Vehicle.aggregate([
        { $match: { isDeleted: false } },
        { $unwind: "$statusHistory" },
        {
            $lookup: {
                from: "branches",
                localField: "purchaseDetails.branch",
                foreignField: "_id",
                as: "branchDetails"
            }
        },
        { $unwind: "$branchDetails" },
        {
            $match: {
                "statusHistory.status": { $in: ["ACTIVE — AVAILABLE", "ACTIVE — RENTED", "W. GROUP ACTIVE"] },
                ...(Object.keys(timelineMatch).length > 0 ? { "statusHistory.timestamp": timelineMatch } : {}),
                ...(filters.branchId ? { "purchaseDetails.branch": new mongoose.Types.ObjectId(filters.branchId) } : {}),
                ...(filters.country ? { "branchDetails.country": filters.country } : {})
            }
        },
        { $group: { _id: null, count: { $sum: 1 } } }
    ]);
    actuals.VEHICLE_ACQUISITION = vehicleActualAgg[0]?.count || 0;

    // Rental Actual
    const rentalActualAgg = await Lease.aggregate([
        {
            $match: {
                status: "ACTIVE",
                ...(Object.keys(timelineMatch).length > 0 ? { createdAt: timelineMatch } : {}),
            }
        },
        {
            $lookup: {
                from: "drivers",
                localField: "driver",
                foreignField: "_id",
                as: "driverDetails"
            }
        },
        { $unwind: "$driverDetails" },
        {
            $lookup: {
                from: "branches",
                localField: "driverDetails.branch",
                foreignField: "_id",
                as: "branchDetails"
            }
        },
        { $unwind: "$branchDetails" },
        {
            $match: {
                ...(filters.branchId ? { "driverDetails.branch": new mongoose.Types.ObjectId(filters.branchId) } : {}),
                ...(filters.country ? { "branchDetails.country": filters.country } : {})
            }
        },
        { $group: { _id: null, count: { $sum: 1 } } }
    ]);
    actuals.RENTAL = rentalActualAgg[0]?.count || 0;

    result.targetComparison = targets.map(t => ({
        category: t.category,
        targetValue: t.targetValue,
        actualValue: actuals[t.category] || 0,
        period: t.period,
        startDate: t.startDate,
        endDate: t.endDate
    }));

    // Attach targets to individual managers/staff for hierarchical analytics
    const globalTargets = await Target.find({
        startDate: { $lte: timelineMatch.$lte || now },
        endDate: { $gte: timelineMatch.$gte || monthAgo }
    }).lean();

    const mapTargetsToEntity = (entityId, type, metrics) => {
        const entityTargets = globalTargets.filter(t => t.targetId === entityId.toString() && t.targetType === type);
        const targetData = {};
        entityTargets.forEach(t => {
            targetData[t.category] = {
                target: t.targetValue,
                actual: 0, // Will fill below
                percent: 0
            };
        });

        // Map actuals from existing metrics
        if (targetData.DRIVER_ACQUISITION) {
            targetData.DRIVER_ACQUISITION.actual = metrics.totalDriversOnboarded || metrics.activeBranchDrivers || metrics.activeCountryDrivers || 0;
            targetData.DRIVER_ACQUISITION.percent = targetData.DRIVER_ACQUISITION.target > 0 ? Math.round((targetData.DRIVER_ACQUISITION.actual / targetData.DRIVER_ACQUISITION.target) * 100) : 0;
        }
        if (targetData.VEHICLE_ACQUISITION) {
            targetData.VEHICLE_ACQUISITION.actual = metrics.totalVehiclesOnboarded || metrics.activeBranchVehicles || metrics.activeCountryVehicles || 0;
            targetData.VEHICLE_ACQUISITION.percent = targetData.VEHICLE_ACQUISITION.target > 0 ? Math.round((targetData.VEHICLE_ACQUISITION.actual / targetData.VEHICLE_ACQUISITION.target) * 100) : 0;
        }

        return targetData;
    };

    result.financeStaff.forEach(s => s.targetStats = mapTargetsToEntity(s.staffId, 'STAFF', s.metrics));
    result.operationStaff.forEach(s => s.targetStats = mapTargetsToEntity(s.staffId, 'STAFF', s.metrics));
    result.branchManagers.forEach(s => s.targetStats = mapTargetsToEntity(s.branchId, 'BRANCH', s.metrics));
    result.countryManagers.forEach(s => s.targetStats = mapTargetsToEntity(s.country, 'COUNTRY', s.metrics));

    // ─────────────────────────────────────────────────────────────
    // Daily Work Output & Productivity Aggregation
    // Invoices, Bills, Debit/Credit Notes, Bank Transactions & Uploads
    // ─────────────────────────────────────────────────────────────
    const allStaffList = [
        ...result.financeStaff,
        ...result.operationStaff,
        ...result.branchManagers,
        ...result.countryManagers,
        ...result.globalAdmins
    ];

    const staffObjectIds = allStaffList
        .map(s => s.staffId)
        .filter(id => id && mongoose.Types.ObjectId.isValid(id))
        .map(id => new mongoose.Types.ObjectId(id));

    const staffStringIds = staffObjectIds.map(id => id.toString());
    const allStaffVariants = [...staffObjectIds, ...staffStringIds];

    const workMatch = {
        createdBy: { $in: allStaffVariants },
        ...(Object.keys(timelineMatch).length > 0 ? { createdAt: timelineMatch } : {})
    };

    const uploadMatch = {
        uploadedBy: { $in: allStaffVariants },
        ...(Object.keys(timelineMatch).length > 0 ? { createdAt: timelineMatch } : {})
    };

    const activityMatch = {
        userId: { $in: allStaffVariants },
        ...(Object.keys(timelineMatch).length > 0 ? { createdAt: timelineMatch } : {})
    };

    // Get all Bank Account accounting code IDs for ledger transactions
    const bankAccounts = await BankAccount.find({ isDeleted: { $ne: true } }).select("accountingCode").lean();
    const bankAccCodeIds = bankAccounts.map(b => b.accountingCode).filter(Boolean);

    const [
        invoiceAgg,
        billAgg,
        debitNoteAgg,
        creditNoteAgg,
        ledgerBankAgg,
        directBankTxAgg,
        uploadAgg,
        activityAgg
    ] = await Promise.all([
        Invoice.aggregate([
            { $match: { isDeleted: { $ne: true }, ...workMatch } },
            {
                $group: {
                    _id: "$createdBy",
                    count: { $sum: 1 },
                    totalAmount: {
                        $sum: {
                            $ifNull: [
                                "$totalAmountDue",
                                { $ifNull: ["$total", { $ifNull: ["$subtotal", { $ifNull: ["$baseAmount", 0] }] }] }
                            ]
                        }
                    }
                }
            }
        ]),
        Bill.aggregate([
            { $match: { isDeleted: { $ne: true }, ...workMatch } },
            {
                $group: {
                    _id: "$createdBy",
                    count: { $sum: 1 },
                    totalAmount: { $sum: { $ifNull: ["$totalAmount", 0] } }
                }
            }
        ]),
        DebitNote.aggregate([
            { $match: { isDeleted: { $ne: true }, ...workMatch } },
            {
                $group: {
                    _id: "$createdBy",
                    count: { $sum: 1 },
                    totalAmount: { $sum: { $ifNull: ["$amount", 0] } }
                }
            }
        ]),
        CreditNote.aggregate([
            { $match: { isDeleted: { $ne: true }, ...workMatch } },
            {
                $group: {
                    _id: "$createdBy",
                    count: { $sum: 1 },
                    totalAmount: { $sum: { $ifNull: ["$amount", 0] } }
                }
            }
        ]),
        // Bank transactions recorded in LedgerEntry (bank accounts' ledger entries)
        LedgerEntry.aggregate([
            {
                $match: {
                    isDeleted: { $ne: true },
                    accountingCode: { $in: bankAccCodeIds },
                    ...workMatch
                }
            },
            {
                $group: {
                    _id: "$createdBy",
                    count: { $sum: 1 },
                    totalAmount: { $sum: { $ifNull: ["$amount", 0] } }
                }
            }
        ]),
        // Direct BankTransaction model entries (if any)
        BankTransaction.aggregate([
            { $match: workMatch },
            {
                $group: {
                    _id: "$createdBy",
                    count: { $sum: 1 },
                    totalAmount: { $sum: { $ifNull: ["$amount", 0] } }
                }
            }
        ]),
        SystemUpload.aggregate([
            { $match: uploadMatch },
            {
                $group: {
                    _id: "$uploadedBy",
                    count: { $sum: 1 }
                }
            }
        ]),
        StaffActivityLog.aggregate([
            { $match: activityMatch },
            {
                $group: {
                    _id: "$userId",
                    count: { $sum: 1 },
                    recentActivities: {
                        $push: {
                            action: "$action",
                            entityType: "$entityType",
                            entityIdentifier: "$entityIdentifier",
                            amount: "$amount",
                            description: "$description",
                            timestamp: "$timestamp"
                        }
                    }
                }
            }
        ])
    ]);

    const staffWorkMap = {};
    const initWork = (id) => {
        const k = id.toString();
        if (!staffWorkMap[k]) {
            staffWorkMap[k] = {
                invoicesCount: 0,
                invoicesTotalAmount: 0,
                billsCount: 0,
                billsTotalAmount: 0,
                debitNotesCount: 0,
                debitNotesTotalAmount: 0,
                creditNotesCount: 0,
                creditNotesTotalAmount: 0,
                bankTransactionsCount: 0,
                bankTransactionsTotalAmount: 0,
                uploadsCount: 0,
                totalDailyWorkDone: 0,
                recentAudit: []
            };
        }
        return staffWorkMap[k];
    };

    staffObjectIds.forEach(id => initWork(id));

    let sumInvoices = 0, sumInvoiceAmt = 0;
    let sumBills = 0, sumBillAmt = 0;
    let sumDN = 0, sumDNAmt = 0;
    let sumCN = 0, sumCNAmt = 0;
    let sumBank = 0, sumBankAmt = 0;
    let sumUploads = 0;

    invoiceAgg.forEach(i => {
        const s = initWork(i._id);
        s.invoicesCount = i.count;
        s.invoicesTotalAmount = i.totalAmount;
        sumInvoices += i.count;
        sumInvoiceAmt += i.totalAmount;
    });

    billAgg.forEach(b => {
        const s = initWork(b._id);
        s.billsCount = b.count;
        s.billsTotalAmount = b.totalAmount;
        sumBills += b.count;
        sumBillAmt += b.totalAmount;
    });

    debitNoteAgg.forEach(d => {
        const s = initWork(d._id);
        s.debitNotesCount = d.count;
        s.debitNotesTotalAmount = d.totalAmount;
        sumDN += d.count;
        sumDNAmt += d.totalAmount;
    });

    creditNoteAgg.forEach(c => {
        const s = initWork(c._id);
        s.creditNotesCount = c.count;
        s.creditNotesTotalAmount = c.totalAmount;
        sumCN += c.count;
        sumCNAmt += c.totalAmount;
    });

    ledgerBankAgg.forEach(t => {
        const s = initWork(t._id);
        s.bankTransactionsCount += t.count;
        s.bankTransactionsTotalAmount += t.totalAmount;
        sumBank += t.count;
        sumBankAmt += t.totalAmount;
    });

    directBankTxAgg.forEach(t => {
        const s = initWork(t._id);
        s.bankTransactionsCount += t.count;
        s.bankTransactionsTotalAmount += t.totalAmount;
        sumBank += t.count;
        sumBankAmt += t.totalAmount;
    });

    uploadAgg.forEach(u => {
        const s = initWork(u._id);
        s.uploadsCount = u.count;
        sumUploads += u.count;
    });

    activityAgg.forEach(a => {
        const s = initWork(a._id);
        s.recentAudit = (a.recentActivities || []).slice(0, 10);
    });

    let activeContributors = 0;
    Object.values(staffWorkMap).forEach(s => {
        s.totalDailyWorkDone = s.invoicesCount + s.billsCount + s.debitNotesCount + s.creditNotesCount + s.bankTransactionsCount + s.uploadsCount;
        if (s.totalDailyWorkDone > 0) activeContributors++;
    });

    // Attach workMetrics to all staff objects
    const attachWork = (s) => {
        const wm = staffWorkMap[s.staffId?.toString()] || initWork(s.staffId);
        s.workMetrics = wm;
        // Keep metrics.totalStageActions in sync so existing sorting remains reliable
        if (wm.totalDailyWorkDone > (s.metrics.totalStageActions || 0)) {
            s.metrics.totalStageActions = wm.totalDailyWorkDone;
        }
    };

    result.financeStaff.forEach(attachWork);
    result.operationStaff.forEach(attachWork);
    result.branchManagers.forEach(attachWork);
    result.countryManagers.forEach(attachWork);
    result.globalAdmins.forEach(attachWork);

    // Build timeline daily trend for charts
    const start = startDate ? new Date(startDate) : new Date(new Date().setDate(1));
    const end = endDate ? new Date(endDate) : new Date();
    end.setHours(23, 59, 59, 999);

    const [dailyInvoices, dailyBills, dailyDN, dailyCN, dailyLedgerBank, dailyDirectBank, dailyUp] = await Promise.all([
        Invoice.aggregate([
            { $match: { isDeleted: { $ne: true }, ...workMatch } },
            { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, count: { $sum: 1 } } }
        ]),
        Bill.aggregate([
            { $match: { isDeleted: { $ne: true }, ...workMatch } },
            { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, count: { $sum: 1 } } }
        ]),
        DebitNote.aggregate([
            { $match: { isDeleted: { $ne: true }, ...workMatch } },
            { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, count: { $sum: 1 } } }
        ]),
        CreditNote.aggregate([
            { $match: { isDeleted: { $ne: true }, ...workMatch } },
            { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, count: { $sum: 1 } } }
        ]),
        LedgerEntry.aggregate([
            {
                $match: {
                    isDeleted: { $ne: true },
                    accountingCode: { $in: bankAccCodeIds },
                    ...workMatch
                }
            },
            { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, count: { $sum: 1 } } }
        ]),
        BankTransaction.aggregate([
            { $match: workMatch },
            { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, count: { $sum: 1 } } }
        ]),
        SystemUpload.aggregate([
            { $match: uploadMatch },
            { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, count: { $sum: 1 } } }
        ])
    ]);

    const dailyMap = {};
    const curr = new Date(start);
    while (curr <= end) {
        const dStr = curr.toISOString().split("T")[0];
        dailyMap[dStr] = {
            date: dStr,
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

    const mergeDaily = (arr, key) => {
        arr.forEach(a => {
            if (dailyMap[a._id]) {
                dailyMap[a._id][key] = (dailyMap[a._id][key] || 0) + a.count;
                dailyMap[a._id].total += a.count;
            }
        });
    };

    mergeDaily(dailyInvoices, "invoices");
    mergeDaily(dailyBills, "bills");
    mergeDaily(dailyDN, "debitNotes");
    mergeDaily(dailyCN, "creditNotes");
    mergeDaily(dailyLedgerBank, "bankTransactions");
    mergeDaily(dailyDirectBank, "bankTransactions");
    mergeDaily(dailyUp, "uploads");

    result.summary = {
        totalInvoices: sumInvoices,
        totalInvoiceAmount: sumInvoiceAmt,
        totalBills: sumBills,
        totalBillAmount: sumBillAmt,
        totalDebitNotes: sumDN,
        totalDebitNoteAmount: sumDNAmt,
        totalCreditNotes: sumCN,
        totalCreditNoteAmount: sumCNAmt,
        totalBankTransactions: sumBank,
        totalBankTransactionAmount: sumBankAmt,
        totalUploads: sumUploads,
        totalDailyWorkDone: sumInvoices + sumBills + sumDN + sumCN + sumBank + sumUploads,
        activeStaffCount: activeContributors || allStaffList.length
    };

    result.dailyTrend = Object.values(dailyMap);

    return result;
};

const getIndividualStaffPerformance = async (staffId, startDate, endDate) => {
    return await getStaffDetailsRepo(staffId, startDate, endDate);
};

const getStaffAuditTrail = async (staffId, options) => {
    return await getStaffAuditTrailRepo(staffId, options);
};

module.exports = {
    getStaffPerformance,
    getIndividualStaffPerformance,
    getStaffAuditTrail
};
