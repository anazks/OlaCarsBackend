const { Vehicle } = require("../../Vehicle/Model/VehicleModel");
const { Driver } = require("../../Driver/Model/DriverModel");
const { Invoice } = require("../../Invoice/Model/InvoiceModel");
const { Alert } = require("../../Alert/Model/AlertModel");
const Branch = require("../../Branch/Model/BranchModel");
const LedgerEntry = require("../../Ledger/Model/LedgerEntryModel");
const moment = require("moment");
const Bill = require("../../Bill/Model/BillModel");
const DashboardSummary = require("../Model/DashboardSummaryModel");
const PaymentReceived = require("../../PaymentReceived/Model/PaymentReceivedModel");

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
const backgroundQueue = [];
let isProcessingQueue = false;

const processBackgroundQueue = async () => {
  if (isProcessingQueue) return;
  isProcessingQueue = true;

  while (backgroundQueue.length > 0) {
    const task = backgroundQueue.shift();
    try {
      const { computeMetricsForBranchAndDate } = require("./DashboardPrecomputeService");
      const metricsDoc = await computeMetricsForBranchAndDate(task.date.toDate(), task.branchId, task.country);
      await DashboardSummary.findOneAndUpdate(
        { date: metricsDoc.date, branch: task.branchId },
        metricsDoc,
        { upsert: true, new: true }
      );
    } catch (err) {
      console.error(`[DashboardService Cache Self-Heal] Failed background precomputation for ${task.date.format("YYYY-MM-DD")} branch ${task.branchId}:`, err);
    } finally {
      precomputeQueue.delete(task.lockKey);
    }
    // Yield to the event loop and database connection pool
    await new Promise(resolve => setTimeout(resolve, 50));
  }

  isProcessingQueue = false;
};

/**
 * Self-healing cache checker: verifies that summaries exist for all target branchIds and dates in the range.
 * If any are missing, they are queued for background calculation.
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
  let queueTriggered = false;
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

        backgroundQueue.push({
          date: currentDay,
          branchId: actualBranchId,
          country,
          lockKey
        });
        queueTriggered = true;
      }
    }
  }

  if (queueTriggered) {
    processBackgroundQueue().catch(err => {
      console.error("[Dashboard Cache] processBackgroundQueue error:", err);
    });
  }
};

exports.getKpiStats = async (filters) => {
  const { country, branch, startDate, endDate } = filters;
  const branchIds = await getBranchIds(country, branch);

  const start = startDate ? moment(startDate).startOf("day") : moment().subtract(30, "days").startOf("day");
  const end = endDate ? moment(endDate).endOf("day") : moment().endOf("day");

  const paymentQuery = {
    status: "COMPLETED",
    paymentDate: { $gte: start.toDate(), $lte: end.toDate() }
  };
  if (branchIds) {
    paymentQuery.branch = { $in: branchIds };
  }

  const invoiceMatch = {
    isDeleted: false,
    dueDate: { $gte: start.toDate(), $lte: end.toDate() }
  };
  
  const pipeline = [
    { $match: invoiceMatch }
  ];

  if (branchIds) {
    pipeline.push(
      {
        $lookup: {
          from: "customers",
          localField: "customer",
          foreignField: "_id",
          as: "customerDoc"
        }
      },
      { $unwind: { path: "$customerDoc", preserveNullAndEmptyArrays: true } },
      {
        $match: {
          "customerDoc.branch": { $in: branchIds.map(id => {
            const mongoose = require("mongoose");
            return new mongoose.Types.ObjectId(id);
          })}
        }
      }
    );
  }

  pipeline.push({
    $group: {
      _id: null,
      totalBalance: { $sum: "$balance" }
    }
  });

  let lastMonthEndDate;
  if (endDate) {
    lastMonthEndDate = moment(endDate).subtract(1, 'month').endOf('month').toDate();
  } else {
    lastMonthEndDate = moment().subtract(1, 'month').endOf('month').toDate();
  }

  const lastMonthInvoiceMatch = {
    isDeleted: false,
    dueDate: { $lte: moment(lastMonthEndDate).endOf('day').toDate() }
  };

  const lastMonthPipeline = [
    { $match: lastMonthInvoiceMatch }
  ];

  if (branchIds) {
    lastMonthPipeline.push(
      {
        $lookup: {
          from: "customers",
          localField: "customer",
          foreignField: "_id",
          as: "customerDoc"
        }
      },
      { $unwind: { path: "$customerDoc", preserveNullAndEmptyArrays: true } },
      {
        $match: {
          "customerDoc.branch": { $in: branchIds.map(id => {
            const mongoose = require("mongoose");
            return new mongoose.Types.ObjectId(id);
          })}
        }
      }
    );
  }

  lastMonthPipeline.push({
    $group: {
      _id: null,
      totalBalance: { $sum: "$balance" }
    }
  });

  const [paymentsList, invoiceAggr, lastMonthInvoiceAggr] = await Promise.all([
    PaymentReceived.find(paymentQuery).lean(),
    Invoice.aggregate(pipeline),
    Invoice.aggregate(lastMonthPipeline)
  ]);

  const monthlyRevenue = paymentsList.reduce((sum, p) => sum + (p.amountReceived || 0), 0);
  const totalPayables = invoiceAggr.length > 0 ? invoiceAggr[0].totalBalance : 0;
  const lastMonthBalanceDue = lastMonthInvoiceAggr.length > 0 ? lastMonthInvoiceAggr[0].totalBalance : 0;

  return {
    stats: {
      monthlyRevenue,
      totalPayables,
      lastMonthBalanceDue
    }
  };
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

  // Define cached summaries query
  const cachedQuery = {
    date: { $gte: cacheStart.toDate(), $lte: cacheEnd.toDate() }
  };
  if (branchIds) {
    cachedQuery.branch = { $in: branchIds };
  }

  let lastMonthEndDate;
  if (endDate) {
    lastMonthEndDate = moment(endDate).subtract(1, 'month').endOf('month').toDate();
  } else {
    lastMonthEndDate = moment().subtract(1, 'month').endOf('month').toDate();
  }

  // Define rolling 12 months query
  const twelveMonthsAgo = moment().subtract(12, "months").startOf("day");

  const l12Query = [
    { $match: {
        date: { $gte: twelveMonthsAgo.toDate(), $lte: moment().toDate() },
        ...(branchIds ? { branch: { $in: branchIds } } : {})
      }
    },
    { $group: { _id: null, totalRevenue: { $sum: "$metrics.revenue" } } }
  ];

  // Start today's live computations (if required)
  const getTodayDocsPromise = async () => {
    const todayDocs = [];
    if (end.isSameOrAfter(todayStart)) {
      const { computeMetricsForAllBranches } = require("./DashboardPrecomputeService");
      const allTodayMetrics = await computeMetricsForAllBranches(todayStart.toDate());
      
      // Filter by the requested branchIds if any
      if (branchIds) {
        const branchIdsSet = new Set(branchIds.map(id => id.toString()));
        allTodayMetrics.forEach(doc => {
          if (doc.branch && branchIdsSet.has(doc.branch.toString())) {
            todayDocs.push(doc);
          }
        });
      } else {
        todayDocs.push(...allTodayMetrics);
      }
    }
    return todayDocs;
  };

  // Run all database calls and computations in parallel
  const [cachedDocs, todayDocs, l12Aggr] = await Promise.all([
    DashboardSummary.find(cachedQuery).lean(),
    getTodayDocsPromise(),
    DashboardSummary.aggregate(l12Query)
  ]);

  const allDocs = [...cachedDocs, ...todayDocs];

  // Filter combined docs by requested date range
  const filteredDocs = allDocs.filter(d => {
    const docDate = moment(d.date);
    return docDate.isBetween(start, end, null, "[]");
  });

  // 1. Transactional metrics (summed over date range)
  let outstandingCollections = 0;

  filteredDocs.forEach(d => {
    outstandingCollections += d.metrics?.outstandingCollections || 0;
  });

  // Query PaymentReceived for total amount received in the filtered period
  const paymentQuery = {
    status: "COMPLETED",
    paymentDate: { $gte: start.toDate(), $lte: end.toDate() }
  };
  if (branchIds) {
    paymentQuery.branch = { $in: branchIds };
  }
  const paymentsList = await PaymentReceived.find(paymentQuery);
  let monthlyRevenue = paymentsList.reduce((sum, p) => sum + (p.amountReceived || 0), 0);

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

  // 3. Current Invoice Balance (Filtered Period) and Last Month's Cumulative Invoice Balance
  const invoiceMatch = {
    isDeleted: false,
    dueDate: { $gte: start.toDate(), $lte: end.toDate() }
  };
  
  const pipeline = [
    { $match: invoiceMatch }
  ];

  if (branchIds) {
    pipeline.push(
      {
        $lookup: {
          from: "customers",
          localField: "customer",
          foreignField: "_id",
          as: "customerDoc"
        }
      },
      { $unwind: { path: "$customerDoc", preserveNullAndEmptyArrays: true } },
      {
        $match: {
          "customerDoc.branch": { $in: branchIds.map(id => {
            const mongoose = require("mongoose");
            return new mongoose.Types.ObjectId(id);
          })}
        }
      }
    );
  }

  pipeline.push({
    $group: {
      _id: null,
      totalBalance: { $sum: "$balance" }
    }
  });

  const invoiceAggr = await Invoice.aggregate(pipeline);
  let totalPayables = invoiceAggr.length > 0 ? invoiceAggr[0].totalBalance : 0;



  const lastMonthInvoiceMatch = {
    isDeleted: false,
    dueDate: { $lte: moment(lastMonthEndDate).endOf('day').toDate() }
  };

  const lastMonthPipeline = [
    { $match: lastMonthInvoiceMatch }
  ];

  if (branchIds) {
    lastMonthPipeline.push(
      {
        $lookup: {
          from: "customers",
          localField: "customer",
          foreignField: "_id",
          as: "customerDoc"
        }
      },
      { $unwind: { path: "$customerDoc", preserveNullAndEmptyArrays: true } },
      {
        $match: {
          "customerDoc.branch": { $in: branchIds.map(id => {
            const mongoose = require("mongoose");
            return new mongoose.Types.ObjectId(id);
          })}
        }
      }
    );
  }

  lastMonthPipeline.push({
    $group: {
      _id: null,
      totalBalance: { $sum: "$balance" }
    }
  });

  const lastMonthInvoiceAggr = await Invoice.aggregate(lastMonthPipeline);
  let lastMonthBalanceDue = lastMonthInvoiceAggr.length > 0 ? lastMonthInvoiceAggr[0].totalBalance : 0;

  const collectionCompliance = 94;

  const realLast12MonthsRevenue = l12Aggr.length > 0 ? l12Aggr[0].totalRevenue : 0;

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



  const match = {
    date: { $gte: startOfPrevYear.toDate(), $lte: now.toDate() }
  };
  if (branchIds) {
    match.branch = { $in: branchIds };
  }

  const docs = await DashboardSummary.aggregate([
    { $match: match },
    {
      $group: {
        _id: {
          year: { $year: "$date" },
          month: { $month: "$date" }
        },
        totalRevenue: { $sum: "$metrics.revenue" }
      }
    }
  ]);

  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const chartData = months.map(m => ({ name: m, currentYear: 0, previousYear: 0 }));

  docs.forEach(d => {
    const year = d._id.year;
    const monthIdx = d._id.month - 1;
    const rev = d.totalRevenue || 0;

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

  if (branchIds) {
    const driversInBranches = await Driver.find({ branch: { $in: branchIds }, isDeleted: false }).select("_id").lean();
    const driverIds = driversInBranches.map(d => d._id);
    match.driver = { $in: driverIds };
  }
  
  let rawInvoices = await Invoice.find(match)
    .populate("driver", "personalInfo branch")
    .populate("vehicle", "legalDocs.registrationNumber")
    .sort({ dueDate: 1 })
    .limit(8)
    .lean();

  const finalInvoices = rawInvoices;

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



  const match = {
    date: { $gte: ninetyDaysAgo.toDate(), $lte: now.toDate() }
  };
  if (branchIds) {
    match.branch = { $in: branchIds };
  }

  const docs = await DashboardSummary.aggregate([
    { $match: match },
    {
      $group: {
        _id: "$date",
        removed: { $sum: "$metrics.vehicleMovement.removed" },
        returned: { $sum: "$metrics.vehicleMovement.returned" },
        sale: { $sum: "$metrics.vehicleMovement.sale" }
      }
    }
  ]);

  const result = docs.map(d => ({
    date: moment(d._id).format("YYYY-MM-DD"),
    removed: d.removed || 0,
    returned: d.returned || 0,
    sale: d.sale || 0
  }))
  .sort((a, b) => moment(a.date).diff(moment(b.date)))
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



  const match = {
    date: { $gte: cacheStart.toDate(), $lte: end.toDate() }
  };
  if (branchIds) {
    match.branch = { $in: branchIds };
  }

  const docs = await DashboardSummary.aggregate([
    { $match: match },
    {
      $group: {
        _id: "$date",
        created: { $sum: "$metrics.workshop.createdWorkOrders" },
        completed: { $sum: "$metrics.workshop.completedWorkOrders" }
      }
    }
  ]);

  const numDays = Math.max(1, end.diff(start, 'days') + 1);
  const datesObj = {};
  for (let i = 0; i < numDays; i++) {
    const d = moment(start).add(i, 'days').format("MMM DD");
    datesObj[d] = { date: d, created: 0, completed: 0 };
  }

  docs.forEach(d => {
    const dateStr = moment(d._id).format("MMM DD");
    if (datesObj[dateStr]) {
      datesObj[dateStr].created += d.created || 0;
      datesObj[dateStr].completed += d.completed || 0;
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
