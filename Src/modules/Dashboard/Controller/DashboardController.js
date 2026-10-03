const DashboardService = require("../Service/DashboardService");
const { ROLES } = require("../../../shared/constants/roles");

const attachRoleFilters = (user, query) => {
    const filters = { ...query };
    // Restrict view based on role
    if (user.role === ROLES.COUNTRYMANAGER) {
        filters.country = user.country;
    } else if (user.role === ROLES.BRANCHMANAGER || user.role === ROLES.FINANCESTAFF || user.role === ROLES.OPERATIONSTAFF) {
        filters.branch = user.branchId;
    }
    return filters;
};

// Tier 2 In-Memory TTL Cache (120s TTL)
const summaryCache = new Map();
const kpiCache = new Map();
const CACHE_TTL_MS = 120 * 1000;

const getCacheKey = (filters) => {
    return `${filters.country || 'all'}:${filters.branch || 'all'}:${filters.startDate || 'all'}:${filters.endDate || 'all'}`;
};

const clearDashboardCacheInternal = () => {
    summaryCache.clear();
    kpiCache.clear();
    DashboardService.clearTodayMetricsCache?.();
};

exports.clearDashboardCacheInternal = clearDashboardCacheInternal;

exports.clearDashboardCache = async (req, res) => {
    try {
        clearDashboardCacheInternal();
        res.status(200).json({ status: "success", message: "Dashboard cache cleared successfully" });
    } catch (error) {
        res.status(500).json({ status: "error", message: error.message });
    }
};

exports.getFinancialDashboardSummary = async (req, res) => {
    try {
        const filters = attachRoleFilters(req.user, req.query);
        const { onlyKpi, refresh } = req.query;
        const bypassCache = refresh === "true" || (req.headers && req.headers["x-bypass-cache"] === "true");
        const cacheKey = getCacheKey(filters);
        const now = Date.now();

        if (!bypassCache) {
            if (onlyKpi === "true") {
                // If full summary is already cached, instantly return KPI stats from it (< 0.1ms)
                if (summaryCache.has(cacheKey)) {
                    const cachedFull = summaryCache.get(cacheKey);
                    if (now < cachedFull.expiry) {
                        return res.status(200).json({
                            status: "success",
                            data: {
                                stats: {
                                    monthlyRevenue: cachedFull.data.stats?.monthlyRevenue || 0,
                                    totalPayables: cachedFull.data.stats?.totalPayables || 0,
                                    lastMonthBalanceDue: cachedFull.data.stats?.lastMonthBalanceDue || 0
                                }
                            },
                            cached: true
                        });
                    }
                }
                // Check dedicated KPI cache
                if (kpiCache.has(cacheKey)) {
                    const cachedKpi = kpiCache.get(cacheKey);
                    if (now < cachedKpi.expiry) {
                        return res.status(200).json({
                            status: "success",
                            data: cachedKpi.data,
                            cached: true
                        });
                    }
                }
            } else {
                // Full summary requested
                if (summaryCache.has(cacheKey)) {
                    const cached = summaryCache.get(cacheKey);
                    if (now < cached.expiry) {
                        return res.status(200).json({
                            status: "success",
                            data: cached.data,
                            cached: true
                        });
                    }
                }
            }
        }

        if (onlyKpi === "true") {
            const kpiData = await DashboardService.getKpiStats(filters);
            kpiCache.set(cacheKey, { data: kpiData, expiry: now + CACHE_TTL_MS });
            return res.status(200).json({
                status: "success",
                data: kpiData
            });
        }
        
        const [summary, revenueTrend, overduePayments, movement] = await Promise.all([
            DashboardService.getSummaryStats(filters),
            DashboardService.getRevenueOverview(filters),
            DashboardService.getRecentOverduePayments(filters),
            DashboardService.getVehicleMovement(filters)
        ]);

        const fullResponseData = {
            ...summary,
            revenueOverview: revenueTrend,
            overduePayments,
            vehicleMovement: movement
        };

        summaryCache.set(cacheKey, { data: fullResponseData, expiry: now + CACHE_TTL_MS });
        // Also cross-seed KPI cache so subsequent onlyKpi queries hit cache instantly
        kpiCache.set(cacheKey, {
            data: {
                stats: {
                    monthlyRevenue: summary.stats?.monthlyRevenue || 0,
                    totalPayables: summary.stats?.totalPayables || 0,
                    lastMonthBalanceDue: summary.stats?.lastMonthBalanceDue || 0
                }
            },
            expiry: now + CACHE_TTL_MS
        });

        res.status(200).json({
            status: "success",
            data: fullResponseData
        });
    } catch (error) {
        console.error("Error getting financial summary:", error);
        res.status(500).json({
            status: "error",
            message: "Internal Server Error",
            error: error.message
        });
    }
};

exports.getVehicleMovementData = async (req, res) => {
    try {
        const filters = attachRoleFilters(req.user, req.query);
        const data = await DashboardService.getVehicleMovement(filters);
        res.status(200).json({ status: "success", data });
    } catch (error) {
        res.status(500).json({ status: "error", message: error.message });
    }
};

exports.getWorkshopDashboardAnalytics = async (req, res) => {
    try {
        const filters = attachRoleFilters(req.user, req.query);
        const data = await DashboardService.getWorkshopAnalytics(filters);
        res.status(200).json({ status: "success", data });
    } catch (error) {
        console.error("Error getting workshop analytics:", error);
        res.status(500).json({ status: "error", message: error.message });
    }
};
