const mongoose = require("mongoose");
const { Driver } = require("../../Driver/Model/DriverModel");
const { Vehicle } = require("../../Vehicle/Model/VehicleModel");
const FinanceStaff = require("../../FinanceStaff/Model/FinanceStaffModel");
const OperationStaff = require("../../OperationStaff/Model/OperationStaffModel");
const BranchManager = require("../../BranchManager/Model/BranchManagerModel");
const CountryManager = require("../../CountryManager/Model/CountryManagerModel");
const Branch = require("../../Branch/Model/BranchModel");
const FinanceAdmin = require("../../FinanceAdmin/model/FinanceAdminModel");
const OperationAdmin = require("../../OperationAdmin/model/OperationAdminModel");
const Target = require("../Model/TargetModel");
const Lease = require("../../Lease/Model/LeaseModel");

/**
 * Aggregates performance metrics for finance and operation staff
 * by cross-referencing Driver/Vehicle statusHistory records.
 */
exports.getStaffPerformance = async (filters = {}) => {
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
                                { $in: ["$statusHistory.status", ["ACTIVE — AVAILABLE", "ACTIVE — RENTED"]] },
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
        for(let d of driverAggr) { if(d._id) bDrivers[d._id.toString()] = d; }

        // For Vehicles
        const vehicleAggr = await Vehicle.aggregate([
            { $match: { isDeleted: false } },
            { $group: { _id: "$purchaseDetails.branch", totalVehicles: { $sum: 1 }, activeVehicles: { $sum: { $cond: [{ $in: ["$status", ["ACTIVE — AVAILABLE", "ACTIVE — RENTED"]] }, 1, 0] } } } }
        ]);
        const bVehicles = {};
        for(let v of vehicleAggr) { if(v._id) bVehicles[v._id.toString()] = v; }

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
        for(let d of driverAggr) { 
            if(d._id) {
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
            { $group: { _id: "$purchaseDetails.branch", totalVehicles: { $sum: 1 }, activeVehicles: { $sum: { $cond: [{ $in: ["$status", ["ACTIVE — AVAILABLE", "ACTIVE — RENTED"]] }, 1, 0] } } } }
        ]);
        const cVehicles = {};
        for(let v of vehicleAggr) { 
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
            { $group: { _id: null, totalVehicles: { $sum: 1 }, activeVehicles: { $sum: { $cond: [{ $in: ["$status", ["ACTIVE — AVAILABLE", "ACTIVE — RENTED"]] }, 1, 0] } } } }
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
                "statusHistory.status": { $in: ["ACTIVE — AVAILABLE", "ACTIVE — RENTED"] },
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

    return result;
};
