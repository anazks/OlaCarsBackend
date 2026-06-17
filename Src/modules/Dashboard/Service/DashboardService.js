const { Vehicle } = require("../../Vehicle/Model/VehicleModel");
const { Driver } = require("../../Driver/Model/DriverModel");
const { Invoice } = require("../../Invoice/Model/InvoiceModel");
const { Alert } = require("../../Alert/Model/AlertModel");
const Branch = require("../../Branch/Model/BranchModel");
const LedgerEntry = require("../../Ledger/Model/LedgerEntryModel");
const moment = require("moment");
const Bill = require("../../Bill/Model/BillModel");
const DashboardSummary = require("../Model/DashboardSummaryModel");

const getBranchIds = async (country, branchId) => {
  let ids = null;
  if (branchId) {
    ids = [branchId];
  } else if (country) {
    const branches = await Branch.find({ country, isDeleted: false }).select("_id");
    ids = branches.map(b => b._id);
  }
  return ids;
};

// In-memory queue to lock dates currently undergoing precomputation
const precomputeQueue = new Set();

/**
 * Self-healing cache checker: verifies that summaries exist for all target branchIds and dates in the range.
 * If any are missing, they are calculated and saved in the background.
 */
const ensureSummariesForRange = async (startMoment, endMoment, branchIds) => {
  const start = moment(startMoment).startOf("day");
  const end = moment(endMoment).startOf("day");
  if (end.isBefore(start)) return;

  // Determine which branch IDs to verify
  let targetBranchIds = [];
  if (branchIds && branchIds.length > 0) {
    targetBranchIds = branchIds.map(id => id.toString());
  } else {
    const activeBranches = await Branch.find({ isDeleted: false }).select("_id").lean();
    targetBranchIds = activeBranches.map(b => b._id.toString());
  }
  // Include null branch to capture global/unassigned entries
  targetBranchIds.push("null");

  // Query database for all existing dashboard summaries in this range
  const query = {
    date: { $gte: start.toDate(), $lte: end.toDate() }
  };
  if (branchIds && branchIds.length > 0) {
    query.branch = { $in: branchIds };
  }
  const existing = await DashboardSummary.find(query).select("date branch").lean();

  const existingSet = new Set();
  existing.forEach(e => {
    const dateStr = moment(e.date).format("YYYY-MM-DD");
    const bId = e.branch ? e.branch.toString() : "null";
    existingSet.add(`${dateStr}_${bId}`);
  });

  const daysDiff = end.diff(start, "days");
  const activeBranchesList = await Branch.find({ isDeleted: false }).select("_id country").lean();
  const branchesById = {};
  activeBranchesList.forEach(b => {
    branchesById[b._id.toString()] = b;
  });

  // Check for any missing date/branch combination
  for (let i = 0; i <= daysDiff; i++) {
    const currentDay = moment(start).add(i, "days");
    const dateStr = currentDay.format("YYYY-MM-DD");

    for (const bId of targetBranchIds) {
      const lockKey = `${dateStr}_${bId}`;
      if (!existingSet.has(lockKey) && !precomputeQueue.has(lockKey)) {
        precomputeQueue.add(lockKey);

        const bObj = branchesById[bId];
        const country = bObj ? bObj.country : null;
        const actualBranchId = bId === "null" ? null : bId;

        // Spawn background precomputation task (non-blocking)
        (async () => {
          try {
            const { computeMetricsForBranchAndDate } = require("./DashboardPrecomputeService");
            const metricsDoc = await computeMetricsForBranchAndDate(currentDay.toDate(), actualBranchId, country);
            await DashboardSummary.findOneAndUpdate(
              { date: metricsDoc.date, branch: actualBranchId },
              metricsDoc,
              { upsert: true, new: true }
            );
          } catch (err) {
            console.error(`[DashboardService Cache Self-Heal] Failed background precomputation for ${dateStr} branch ${bId}:`, err);
          } finally {
            precomputeQueue.delete(lockKey);
          }
        })();
      }
    }
  }
};

exports.getSummaryStats = async (filters) => {
  const { country, branch, startDate, endDate } = filters;
  const branchIds = await getBranchIds(country, branch);

  // Normalize date range
  const start = startDate ? moment(startDate).startOf("day") : moment().subtract(30, "days").startOf("day");
  const end = endDate ? moment(endDate).endOf("day") : moment().endOf("day");

  const todayStart = moment().startOf("day");
  const yesterdayEnd = moment().subtract(1, "day").endOf("day");

  // Cache is kept only up to yesterday
  const cacheStart = start.isBefore(yesterdayEnd) ? start : yesterdayEnd;
  const cacheEnd = end.isBefore(yesterdayEnd) ? end : yesterdayEnd;

  if (cacheStart.isSameOrBefore(cacheEnd)) {
    // Background check - do NOT await
    ensureSummariesForRange(cacheStart, cacheEnd, branchIds).catch(err => {
      console.error("[Dashboard Cache] Background check error:", err);
    });
  }

  // Fetch cached summaries
  const cachedQuery = {
    date: { $gte: cacheStart.toDate(), $lte: cacheEnd.toDate() }
  };
  if (branchIds) {
    cachedQuery.branch = { $in: branchIds };
  }
  const cachedDocs = await DashboardSummary.find(cachedQuery).lean();

  // Compute today's metrics live (since they are changing)
  const todayDocs = [];
  if (end.isSameOrAfter(todayStart)) {
    const activeBranches = await Branch.find({ isDeleted: false }).select("_id country").lean();
    let branchesToCompute = activeBranches;
    if (branchIds) {
      branchesToCompute = activeBranches.filter(b => branchIds.map(id => id.toString()).includes(b._id.toString()));
    }
    
    const { computeMetricsForBranchAndDate } = require("./DashboardPrecomputeService");
    for (const b of branchesToCompute) {
      const todayMetrics = await computeMetricsForBranchAndDate(todayStart.toDate(), b._id, b.country);
      todayDocs.push(todayMetrics);
    }
    
    // Also compute unassigned/null branch for today
    if (!branchIds || branchIds.length === 0) {
      const todayNullMetrics = await computeMetricsForBranchAndDate(todayStart.toDate(), null, null);
      todayDocs.push(todayNullMetrics);
    }
  }

  const allDocs = [...cachedDocs, ...todayDocs];

  // Filter combined docs by requested date range
  const filteredDocs = allDocs.filter(d => {
    const docDate = moment(d.date);
    return docDate.isBetween(start, end, null, "[]");
  });

  // 1. Transactional metrics (summed over date range)
  let monthlyRevenue = 0;
  let outstandingCollections = 0;

  filteredDocs.forEach(d => {
    monthlyRevenue += d.metrics?.revenue || 0;
    outstandingCollections += d.metrics?.outstandingCollections || 0;
  });

  // 2. Snapshot metrics (latest values in the range)
  let latestDateDoc = null;
  let maxTime = 0;
  filteredDocs.forEach(d => {
    const t = new Date(d.date).getTime();
    if (t > maxTime) {
      maxTime = t;
      latestDateDoc = d;
    }
  });

  let snapshotDocs = [];
  if (latestDateDoc) {
    const latestDateStr = moment(latestDateDoc.date).format("YYYY-MM-DD");
    snapshotDocs = filteredDocs.filter(d => moment(d.date).format("YYYY-MM-DD") === latestDateStr);
  } else {
    snapshotDocs = todayDocs;
  }

  let totalActiveVehicles = 0;
  let activeDrivers = 0;
  const fleetStatus = { available: 0, rented: 0, maintenance: 0, retired: 0, other: 0 };
  const alerts = { CRITICAL: 0, MAJOR: 0, MINOR: 0 };

  snapshotDocs.forEach(d => {
    totalActiveVehicles += d.metrics?.activeVehicles || 0;
    activeDrivers += d.metrics?.activeDrivers || 0;
    if (d.metrics?.fleetStatus) {
      fleetStatus.available += d.metrics.fleetStatus.available || 0;
      fleetStatus.rented += d.metrics.fleetStatus.rented || 0;
      fleetStatus.maintenance += d.metrics.fleetStatus.maintenance || 0;
      fleetStatus.retired += d.metrics.fleetStatus.retired || 0;
      fleetStatus.other += d.metrics.fleetStatus.other || 0;
    }
    if (d.metrics?.alerts) {
      alerts.CRITICAL += d.metrics.alerts.CRITICAL || 0;
      alerts.MAJOR += d.metrics.alerts.MAJOR || 0;
      alerts.MINOR += d.metrics.alerts.MINOR || 0;
    }
  });

  totalActiveVehicles = fleetStatus.available + fleetStatus.rented;

  // 3. Current Payables and Last Month's Balance Due
  const billMatch = { status: { $nin: ["PAID", "VOID"] } };
  if (branchIds) billMatch.branchId = { $in: branchIds };
  const payablesAggr = await Bill.aggregate([
    { $match: billMatch },
    { $group: { _id: null, total: { $sum: "$balanceDue" } } }
  ]);
  let totalPayables = payablesAggr.length > 0 ? payablesAggr[0].total : 0;

  let lastMonthEndDate;
  if (endDate) {
    lastMonthEndDate = moment(endDate).subtract(1, 'month').endOf('month').toDate();
  } else {
    lastMonthEndDate = moment().subtract(1, 'month').endOf('month').toDate();
  }

  const lastMonthBillMatch = {
    status: { $nin: ["PAID", "VOID"] },
    billDate: { $lte: moment(lastMonthEndDate).endOf('day').toDate() }
  };
  if (branchIds) lastMonthBillMatch.branchId = { $in: branchIds };

  const lastMonthPayablesAggr = await Bill.aggregate([
    { $match: lastMonthBillMatch },
    { $group: { _id: null, total: { $sum: "$balanceDue" } } }
  ]);
  let lastMonthBalanceDue = lastMonthPayablesAggr.length > 0 ? lastMonthPayablesAggr[0].total : 0;

  const collectionCompliance = 94;

  // 4. Last 12 months rolling revenue
  const twelveMonthsAgo = moment().subtract(12, "months").startOf("day");
  ensureSummariesForRange(twelveMonthsAgo, yesterdayEnd, branchIds).catch(err => {
    console.error("[Dashboard Cache] Background l12 check error:", err);
  });
  
  const l12Query = {
    date: { $gte: twelveMonthsAgo.toDate(), $lte: moment().toDate() }
  };
  if (branchIds) {
    l12Query.branch = { $in: branchIds };
  }
  const l12Docs = await DashboardSummary.find(l12Query).lean();
  let realLast12MonthsRevenue = 0;
  l12Docs.forEach(d => {
    realLast12MonthsRevenue += d.metrics?.revenue || 0;
  });

  return {
    stats: {
      totalActiveVehicles,
      monthlyRevenue,
      outstandingCollections,
      activeDrivers,
      collectionCompliance,
      last12MonthsRevenue: realLast12MonthsRevenue,
      outstandingBalance: outstandingCollections,
      totalPayables,
      lastMonthBalanceDue
    },
    alerts,
    fleetStatus,
    totalVehicles: Object.values(fleetStatus).reduce((a, b) => a + b, 0)
  };
};

exports.getRevenueOverview = async (filters) => {
  const { country, branch } = filters;
  const branchIds = await getBranchIds(country, branch);

  const now = moment();
  const currentYear = now.year();
  const previousYear = now.year() - 1;
  const startOfPrevYear = moment().year(previousYear).startOf("year");
  const yesterdayEnd = moment().subtract(1, "day").endOf("day");

  // Background check - do NOT await
  ensureSummariesForRange(startOfPrevYear, yesterdayEnd, branchIds).catch(err => {
    console.error("[Dashboard Cache] Background revenue check error:", err);
  });

  const query = {
    date: { $gte: startOfPrevYear.toDate(), $lte: now.toDate() }
  };
  if (branchIds) {
    query.branch = { $in: branchIds };
  }
  const docs = await DashboardSummary.find(query).lean();

  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const chartData = months.map(m => ({ name: m, currentYear: 0, previousYear: 0 }));

  docs.forEach(d => {
    const docDate = moment(d.date);
    const year = docDate.year();
    const monthIdx = docDate.month();
    const rev = d.metrics?.revenue || 0;

    if (monthIdx >= 0 && monthIdx < 12) {
      if (year === currentYear) {
        chartData[monthIdx].currentYear += rev;
      } else if (year === previousYear) {
        chartData[monthIdx].previousYear += rev;
      }
    }
  });

  return chartData;
};

exports.getRecentOverduePayments = async (filters) => {
  const { country, branch } = filters;
  const branchIds = await getBranchIds(country, branch);

  const match = { 
    status: { $in: ["OVERDUE", "PENDING", "PARTIAL"] }, 
    dueDate: { $lt: new Date() },
    balance: { $gt: 0 },
    isDeleted: false 
  };
  
  let rawInvoices = await Invoice.find(match)
    .populate({
      path: "driver",
      select: "personalInfo branch",
      match: branchIds ? { branch: { $in: branchIds } } : {}
    })
    .populate("vehicle", "legalDocs.registrationNumber")
    .sort({ dueDate: 1 })
    .limit(20)
    .lean();

  const finalInvoices = rawInvoices.filter(i => i.driver).slice(0, 8);

  return finalInvoices.map(i => {
    const days = moment().diff(moment(i.dueDate), "days");
    return {
      id: i._id,
      customerName: i.driver?.personalInfo?.fullName || "Unknown",
      vehicleNumber: i.vehicle?.legalDocs?.registrationNumber || "N/A",
      amount: i.balance,
      dueDate: i.dueDate,
      daysOverdue: days > 0 ? days : 0
    };
  });
};

exports.getVehicleMovement = async (filters) => {
  const { country, branch } = filters;
  const branchIds = await getBranchIds(country, branch);

  const now = moment();
  const ninetyDaysAgo = moment().subtract(90, 'days').startOf('day');
  const yesterdayEnd = moment().subtract(1, "day").endOf("day");

  // Background check - do NOT await
  ensureSummariesForRange(ninetyDaysAgo, yesterdayEnd, branchIds).catch(err => {
    console.error("[Dashboard Cache] Background vehicle movement check error:", err);
  });

  const query = {
    date: { $gte: ninetyDaysAgo.toDate(), $lte: now.toDate() }
  };
  if (branchIds) {
    query.branch = { $in: branchIds };
  }
  const docs = await DashboardSummary.find(query).lean();

  const movementData = {};
  docs.forEach(d => {
    const dateKey = moment(d.date).format("YYYY-MM-DD");
    if (!movementData[dateKey]) {
      movementData[dateKey] = { date: dateKey, removed: 0, returned: 0, sale: 0 };
    }
    if (d.metrics?.vehicleMovement) {
      movementData[dateKey].removed += d.metrics.vehicleMovement.removed || 0;
      movementData[dateKey].returned += d.metrics.vehicleMovement.returned || 0;
      movementData[dateKey].sale += d.metrics.vehicleMovement.sale || 0;
    }
  });

  const result = Object.values(movementData)
    .sort((a,b) => moment(a.date).diff(moment(b.date)))
    .slice(-30); // last 30 active days

  return result;
};

exports.getWorkshopAnalytics = async (filters) => {
  const { country, branch, startDate, endDate } = filters;
  const branchIds = await getBranchIds(country, branch);

  let start = startDate ? moment(startDate).startOf('day') : moment().subtract(30, 'days').startOf('day');
  let end = endDate ? moment(endDate).endOf('day') : moment().endOf('day');
  const yesterdayEnd = moment().subtract(1, "day").endOf("day");

  const cacheStart = start.isBefore(yesterdayEnd) ? start : yesterdayEnd;
  const cacheEnd = end.isBefore(yesterdayEnd) ? end : yesterdayEnd;

  if (cacheStart.isSameOrBefore(cacheEnd)) {
    // Background check - do NOT await
    ensureSummariesForRange(cacheStart, cacheEnd, branchIds).catch(err => {
      console.error("[Dashboard Cache] Background workshop check error:", err);
    });
  }

  const query = {
    date: { $gte: cacheStart.toDate(), $lte: end.toDate() }
  };
  if (branchIds) {
    query.branch = { $in: branchIds };
  }
  const docs = await DashboardSummary.find(query).lean();

  const numDays = Math.max(1, end.diff(start, 'days') + 1);
  const datesObj = {};
  for (let i = 0; i < numDays; i++) {
    const d = moment(start).add(i, 'days').format("MMM DD");
    datesObj[d] = { date: d, created: 0, completed: 0 };
  }

  docs.forEach(d => {
    const dateStr = moment(d.date).format("MMM DD");
    if (datesObj[dateStr] && d.metrics?.workshop) {
      datesObj[dateStr].created += d.metrics.workshop.createdWorkOrders || 0;
      datesObj[dateStr].completed += d.metrics.workshop.completedWorkOrders || 0;
    }
  });

  const workOrderTrends = Object.values(datesObj);

  const { InventoryPart } = require("../../Inventory/Model/InventoryPartModel");
  const stockMatch = { isActive: true };
  if (branchIds) stockMatch.branchId = { $in: branchIds };
  
  const parts = await InventoryPart.find(stockMatch).select("quantityOnHand reorderLevel").lean();
  let healthyStock = 0;
  let lowStock = 0;
  
  parts.forEach(p => {
    if (p.quantityOnHand <= (p.reorderLevel || 0)) {
      lowStock += 1;
    } else {
      healthyStock += 1;
    }
  });

  const stockHealth = [
    { name: "Healthy", value: healthyStock },
    { name: "Low Stock", value: lowStock }
  ];

  return {
    workOrderTrends,
    stockHealth
  };
};
