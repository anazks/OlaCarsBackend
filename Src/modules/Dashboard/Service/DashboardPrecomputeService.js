const { Vehicle } = require("../../Vehicle/Model/VehicleModel");
const { Driver } = require("../../Driver/Model/DriverModel");
const { Invoice } = require("../../Invoice/Model/InvoiceModel");
const { Alert } = require("../../Alert/Model/AlertModel");
const Branch = require("../../Branch/Model/BranchModel");
const LedgerEntry = require("../../Ledger/Model/LedgerEntryModel");
const Bill = require("../../Bill/Model/BillModel");
const { WorkOrder } = require("../../WorkOrder/Model/WorkOrderModel");
const AccountingCode = require("../../AccountingCode/Model/AccountingCodeModel");
const DashboardSummary = require("../Model/DashboardSummaryModel");
const moment = require("moment");

/**
 * Computes dashboard metrics for a specific branch and date.
 */
exports.computeMetricsForBranchAndDate = async (date, branchId, country = null) => {
  const startOfDay = moment(date).startOf("day").toDate();
  const endOfDay = moment(date).endOf("day").toDate();

  // Run the independent preliminary query for income accounting codes
  const incomeCodesPromise = AccountingCode.find({ category: "INCOME", isDeleted: false }).select("_id").lean();

  const activeWoQuery = {
    status: { $nin: ["CLOSED", "VEHICLE_RELEASED", "INVOICED", "CANCELLED"] },
    isDeleted: false
  };
  const alertQuery = { isDeleted: false, status: "ACTIVE" };
  const vehicleQuery = { isDeleted: false };
  const driverQuery = { isDeleted: false, status: "ACTIVE" };
  const woCreatedQuery = { createdAt: { $gte: startOfDay, $lte: endOfDay }, isDeleted: false };
  const woCompletedQuery = { updatedAt: { $gte: startOfDay, $lte: endOfDay }, status: { $in: ["CLOSED", "VEHICLE_RELEASED", "INVOICED"] }, isDeleted: false };

  if (branchId) {
    activeWoQuery.branchId = branchId;
    alertQuery.branchId = branchId;
    vehicleQuery["purchaseDetails.branch"] = branchId;
    driverQuery.branch = branchId;
    woCreatedQuery.branchId = branchId;
    woCompletedQuery.branchId = branchId;
  } else {
    activeWoQuery.branchId = null;
    alertQuery.branchId = null;
    vehicleQuery["purchaseDetails.branch"] = null;
    driverQuery.branch = null;
    woCreatedQuery.branchId = null;
    woCompletedQuery.branchId = null;
  }

  // Get drivers list for outstanding collections filter in parallel
  const driversListPromise = Driver.find(branchId ? { branch: branchId, isDeleted: false } : { branch: null, isDeleted: false }).select("_id").lean();

  const [incomeCodes, driversList] = await Promise.all([
    incomeCodesPromise,
    driversListPromise
  ]);

  const incomeCodeIds = incomeCodes.map(c => c._id);
  const driverIds = driversList.map(d => d._id);

  const ledgerMatch = {
    accountingCode: { $in: incomeCodeIds },
    entryDate: { $gte: startOfDay, $lte: endOfDay },
    branch: branchId || null
  };

  const invoiceMatch = {
    generatedAt: { $gte: startOfDay, $lte: endOfDay },
    isDeleted: false
  };
  if (branchId) {
    invoiceMatch.driver = { $in: driverIds };
  } else {
    invoiceMatch.$or = [{ driver: { $in: driverIds } }, { driver: null }];
  }

  const billMatch = {
    createdAt: { $gte: startOfDay, $lte: endOfDay },
    branch: branchId || null
  };

  const totalPayablesMatch = {
    createdAt: { $lte: endOfDay },
    status: { $nin: ["PAID", "VOID"] },
    branch: branchId || null
  };

  // Run all database calls in parallel
  const [
    totalRevAggr,
    outstandingAggr,
    payablesAggr,
    totalPayablesAggr,
    activeDrivers,
    activeWoVehicles,
    vehicles,
    alertGrouping,
    createdWorkOrders,
    completedWorkOrders
  ] = await Promise.all([
    LedgerEntry.aggregate([
      { $match: ledgerMatch },
      { $group: { _id: null, total: { $sum: "$amount" } } }
    ]),
    Invoice.aggregate([
      { $match: invoiceMatch },
      { $group: { _id: null, total: { $sum: "$balance" } } }
    ]),
    Bill.aggregate([
      { $match: billMatch },
      { $group: { _id: null, total: { $sum: "$balanceDue" } } }
    ]),
    Bill.aggregate([
      { $match: totalPayablesMatch },
      { $group: { _id: null, total: { $sum: "$balanceDue" } } }
    ]),
    Driver.countDocuments(driverQuery),
    WorkOrder.distinct("vehicleId", activeWoQuery),
    Vehicle.find(vehicleQuery).select("status statusHistory _id").lean(),
    Alert.aggregate([
      { $match: alertQuery },
      { $group: { _id: "$priority", count: { $sum: 1 } } }
    ]),
    WorkOrder.countDocuments(woCreatedQuery),
    WorkOrder.countDocuments(woCompletedQuery)
  ]);

  const revenue = totalRevAggr.length > 0 ? totalRevAggr[0].total : 0;
  const outstandingCollections = outstandingAggr.length > 0 ? outstandingAggr[0].total : 0;
  const payables = payablesAggr.length > 0 ? payablesAggr[0].total : 0;
  const totalPayables = totalPayablesAggr.length > 0 ? totalPayablesAggr[0].total : 0;

  const maintenanceVehicleIds = new Set(activeWoVehicles.map(id => id.toString()));
  const fleetStatus = { available: 0, rented: 0, maintenance: 0, retired: 0, other: 0 };

  vehicles.forEach(v => {
    const idStr = v._id.toString();
    if (maintenanceVehicleIds.has(idStr)) {
      fleetStatus.maintenance += 1;
    } else {
      const s = v.status;
      if (s === "ACTIVE — AVAILABLE") fleetStatus.available += 1;
      else if (s === "ACTIVE — RENTED" || s === "W. GROUP ACTIVE") fleetStatus.rented += 1;
      else if (s === "ACTIVE — MAINTENANCE" || s === "REPAIR IN PROGRESS") fleetStatus.maintenance += 1;
      else if (s === "RETIRED") fleetStatus.retired += 1;
      else fleetStatus.other += 1;
    }
  });

  const activeVehicles = fleetStatus.available + fleetStatus.rented;

  const alerts = { CRITICAL: 0, MAJOR: 0, MINOR: 0 };
  alertGrouping.forEach(g => {
    if (g._id === "HIGH") alerts.CRITICAL = g.count;
    else if (g._id === "MEDIUM") alerts.MAJOR = g.count;
    else if (g._id === "LOW") alerts.MINOR = g.count;
  });

  // Calculate vehicle movement from the same vehicles query
  const vehicleMovement = { removed: 0, returned: 0, sale: 0 };
  vehicles.forEach(v => {
    if (!v.statusHistory) return;
    v.statusHistory.forEach(hist => {
      const ts = moment(hist.timestamp);
      if (ts.isBetween(startOfDay, endOfDay, null, "[]")) {
        const s = hist.status;
        if (s === "ACTIVE — RENTED") vehicleMovement.sale += 1;
        else if (s === "ACTIVE — AVAILABLE") vehicleMovement.returned += 1;
        else if (s === "RETIRED" || s === "SUSPENDED") vehicleMovement.removed += 1;
      }
    });
  });

  return {
    date: startOfDay,
    branch: branchId || null,
    country: country || null,
    metrics: {
      revenue,
      outstandingCollections,
      payables,
      activeVehicles,
      activeDrivers,
      totalPayables,
      alerts,
      fleetStatus,
      vehicleMovement,
      workshop: {
        createdWorkOrders,
        completedWorkOrders
      }
    }
  };
};


const precomputeBranchDate = async (date, branchId, country = null) => {
  const updateDoc = await exports.computeMetricsForBranchAndDate(date, branchId, country);
  await DashboardSummary.findOneAndUpdate(
    { date: updateDoc.date, branch: branchId || null },
    updateDoc,
    { upsert: true, returnDocument: 'after' }
  );
};

/**
 * Precomputes metrics for all branches across a date range.
 */
exports.precomputeForDateRange = async (startDate, endDate) => {
  const start = moment(startDate).startOf("day");
  const end = moment(endDate).startOf("day");

  const branches = await Branch.find({ isDeleted: false }).select("_id country").lean();

  const daysDiff = end.diff(start, "days");

  for (let i = 0; i <= daysDiff; i++) {
    const currentDay = moment(start).add(i, "days").toDate();
    // console.log(`[DashboardPrecomputeService] Precomputing for date: ${currentDay.toISOString().split("T")[0]}`);

    // Precompute for each active branch
    for (const branch of branches) {
      await precomputeBranchDate(currentDay, branch._id, branch.country);
    }

    // Precompute for unassigned/null branch
    await precomputeBranchDate(currentDay, null, null);
  }

  console.log("[DashboardPrecomputeService] Precomputation completed for date range.");
};

/**
 * Convenience method to precompute yesterday and today.
 */
exports.precomputeYesterdayAndToday = async () => {
  const yesterday = moment().subtract(1, "day").startOf("day").toDate();
  const today = moment().startOf("day").toDate();
  await exports.precomputeForDateRange(yesterday, today);
};

/**
 * Computes today's dashboard metrics globally for all branches in parallel and returns them.
 */
exports.computeMetricsForAllBranches = async (date) => {
  const startOfDay = moment(date).startOf("day").toDate();
  const endOfDay = moment(date).endOf("day").toDate();

  const activeBranches = await Branch.find({ isDeleted: false }).lean();

  const [
    incomeCodes,
    activeDriversAggr,
    alertsAggr,
    activeWorkOrders,
    todayLedgers,
    todayInvoices,
    todayBills,
    unpaidBillsAggr,
    todayCreatedWos,
    todayCompletedWos,
    vehicleStatusAggr,
    vehicleMovementAggr
  ] = await Promise.all([
    AccountingCode.find({ category: "INCOME", isDeleted: false }).select("_id").lean(),
    Driver.aggregate([
      { $match: { isDeleted: false, status: "ACTIVE" } },
      { $group: { _id: "$branch", count: { $sum: 1 } } }
    ]),
    Alert.aggregate([
      { $match: { isDeleted: false, status: "ACTIVE" } },
      { $group: { _id: { branchId: "$branchId", priority: "$priority" }, count: { $sum: 1 } } }
    ]),
    WorkOrder.find({ status: { $nin: ["CLOSED", "VEHICLE_RELEASED", "INVOICED", "CANCELLED"] }, isDeleted: false }).select("vehicleId branchId").lean(),
    LedgerEntry.find({ entryDate: { $gte: startOfDay, $lte: endOfDay } }).select("amount branch accountingCode").lean(),
    Invoice.find({ generatedAt: { $gte: startOfDay, $lte: endOfDay }, isDeleted: false }).select("balance driver").lean(),
    Bill.find({ createdAt: { $gte: startOfDay, $lte: endOfDay } }).select("balanceDue branch").lean(),
    Bill.aggregate([
      { $match: { status: { $nin: ["PAID", "VOID"] }, createdAt: { $lte: endOfDay } } },
      { $group: { _id: "$branch", total: { $sum: "$balanceDue" } } }
    ]),
    WorkOrder.aggregate([
      { $match: { createdAt: { $gte: startOfDay, $lte: endOfDay }, isDeleted: false } },
      { $group: { _id: "$branchId", count: { $sum: 1 } } }
    ]),
    WorkOrder.aggregate([
      { $match: { updatedAt: { $gte: startOfDay, $lte: endOfDay }, status: { $in: ["CLOSED", "VEHICLE_RELEASED", "INVOICED"] }, isDeleted: false } },
      { $group: { _id: "$branchId", count: { $sum: 1 } } }
    ]),
    Vehicle.aggregate([
      { $match: { isDeleted: false } },
      { $group: { _id: { branch: "$purchaseDetails.branch", status: "$status" }, count: { $sum: 1 } } }
    ]),
    Vehicle.aggregate([
      { $match: { isDeleted: false, "statusHistory.timestamp": { $gte: startOfDay, $lte: endOfDay } } },
      { $unwind: "$statusHistory" },
      { $match: { "statusHistory.timestamp": { $gte: startOfDay, $lte: endOfDay } } },
      { $group: { _id: { branch: "$purchaseDetails.branch", status: "$statusHistory.status" }, count: { $sum: 1 } } }
    ])
  ]);

  // Fetch the specific vehicles currently in maintenance to adjust status counts in memory
  const maintenanceVehicleIds = activeWorkOrders.filter(wo => wo.vehicleId).map(wo => wo.vehicleId);
  const maintenanceVehicles = await Vehicle.find({ _id: { $in: maintenanceVehicleIds } }).select("status purchaseDetails.branch").lean();

  const incomeCodeIdsSet = new Set(incomeCodes.map(c => c._id.toString()));

  // Get active drivers list globally to map driver to branch
  const drivers = await Driver.find({ isDeleted: false }).select("branch").lean();
  const driverToBranchMap = {};
  drivers.forEach(d => {
    driverToBranchMap[d._id.toString()] = d.branch ? d.branch.toString() : "null";
  });

  const branchIds = [...activeBranches.map(b => b._id.toString()), "null"];
  const metricsByBranch = {};
  branchIds.forEach(bId => {
    const branchObj = activeBranches.find(b => b._id.toString() === bId);
    metricsByBranch[bId] = {
      date: startOfDay,
      branch: bId === "null" ? null : branchObj._id,
      country: bId === "null" ? null : (branchObj.country || null),
      metrics: {
        revenue: 0,
        outstandingCollections: 0,
        payables: 0,
        activeVehicles: 0,
        activeDrivers: 0,
        totalPayables: 0,
        alerts: { CRITICAL: 0, MAJOR: 0, MINOR: 0 },
        fleetStatus: { available: 0, rented: 0, maintenance: 0, retired: 0, other: 0 },
        vehicleMovement: { removed: 0, returned: 0, sale: 0 },
        workshop: { createdWorkOrders: 0, completedWorkOrders: 0 }
      }
    };
  });

  // 1. Revenue
  todayLedgers.forEach(l => {
    if (incomeCodeIdsSet.has(l.accountingCode.toString())) {
      const bId = l.branch ? l.branch.toString() : "null";
      if (metricsByBranch[bId]) {
        metricsByBranch[bId].metrics.revenue += l.amount || 0;
      }
    }
  });

  // 2. Outstanding Collections
  todayInvoices.forEach(inv => {
    if (inv.driver) {
      const bId = driverToBranchMap[inv.driver.toString()] || "null";
      if (metricsByBranch[bId]) {
        metricsByBranch[bId].metrics.outstandingCollections += inv.balance || 0;
      }
    } else {
      metricsByBranch["null"].metrics.outstandingCollections += inv.balance || 0;
    }
  });

  // 3. Payables
  todayBills.forEach(b => {
    const bId = b.branch ? b.branch.toString() : "null";
    if (metricsByBranch[bId]) {
      metricsByBranch[bId].metrics.payables += b.balanceDue || 0;
    }
  });

  // 4. Total Payables
  unpaidBillsAggr.forEach(b => {
    const bId = b._id ? b._id.toString() : "null";
    if (metricsByBranch[bId]) {
      metricsByBranch[bId].metrics.totalPayables = b.total || 0;
    }
  });

  // 5. Active Drivers
  activeDriversAggr.forEach(d => {
    const bId = d._id ? d._id.toString() : "null";
    if (metricsByBranch[bId]) {
      metricsByBranch[bId].metrics.activeDrivers = d.count;
    }
  });

  // 6. Fleet Status & Active Vehicles
  vehicleStatusAggr.forEach(v => {
    const bId = v._id.branch ? v._id.branch.toString() : "null";
    if (!metricsByBranch[bId]) return;

    const s = v._id.status;
    const count = v.count;

    if (s === "ACTIVE — AVAILABLE") metricsByBranch[bId].metrics.fleetStatus.available += count;
    else if (s === "ACTIVE — RENTED" || s === "W. GROUP ACTIVE") metricsByBranch[bId].metrics.fleetStatus.rented += count;
    else if (s === "ACTIVE — MAINTENANCE" || s === "REPAIR IN PROGRESS") metricsByBranch[bId].metrics.fleetStatus.maintenance += count;
    else if (s === "RETIRED") metricsByBranch[bId].metrics.fleetStatus.retired += count;
    else metricsByBranch[bId].metrics.fleetStatus.other += count;
  });

  // Adjust for active work order maintenance vehicles (re-categorize them to maintenance status)
  maintenanceVehicles.forEach(mv => {
    const bId = mv.purchaseDetails?.branch ? mv.purchaseDetails.branch.toString() : "null";
    if (!metricsByBranch[bId]) return;

    const s = mv.status;
    if (s === "ACTIVE — AVAILABLE" && metricsByBranch[bId].metrics.fleetStatus.available > 0) metricsByBranch[bId].metrics.fleetStatus.available -= 1;
    else if ((s === "ACTIVE — RENTED" || s === "W. GROUP ACTIVE") && metricsByBranch[bId].metrics.fleetStatus.rented > 0) metricsByBranch[bId].metrics.fleetStatus.rented -= 1;
    else if ((s === "ACTIVE — MAINTENANCE" || s === "REPAIR IN PROGRESS") && metricsByBranch[bId].metrics.fleetStatus.maintenance > 0) metricsByBranch[bId].metrics.fleetStatus.maintenance -= 1;
    else if (s === "RETIRED" && metricsByBranch[bId].metrics.fleetStatus.retired > 0) metricsByBranch[bId].metrics.fleetStatus.retired -= 1;
    else if (metricsByBranch[bId].metrics.fleetStatus.other > 0) metricsByBranch[bId].metrics.fleetStatus.other -= 1;

    metricsByBranch[bId].metrics.fleetStatus.maintenance += 1;
  });

  branchIds.forEach(bId => {
    const fs = metricsByBranch[bId].metrics.fleetStatus;
    metricsByBranch[bId].metrics.activeVehicles = fs.available + fs.rented;
  });

  // 7. Alerts
  alertsAggr.forEach(a => {
    const bId = a._id.branchId ? a._id.branchId.toString() : "null";
    if (metricsByBranch[bId]) {
      if (a._id.priority === "HIGH") metricsByBranch[bId].metrics.alerts.CRITICAL += a.count;
      else if (a._id.priority === "MEDIUM") metricsByBranch[bId].metrics.alerts.MAJOR += a.count;
      else if (a._id.priority === "LOW") metricsByBranch[bId].metrics.alerts.MINOR += a.count;
    }
  });

  // 8. Vehicle Movement
  vehicleMovementAggr.forEach(vm => {
    const bId = vm._id.branch ? vm._id.branch.toString() : "null";
    if (metricsByBranch[bId]) {
      const s = vm._id.status;
      const count = vm.count;
      if (s === "ACTIVE — RENTED") metricsByBranch[bId].metrics.vehicleMovement.sale += count;
      else if (s === "ACTIVE — AVAILABLE") metricsByBranch[bId].metrics.vehicleMovement.returned += count;
      else if (s === "RETIRED" || s === "SUSPENDED") metricsByBranch[bId].metrics.vehicleMovement.removed += count;
    }
  });

  // 9. Workshop (Created / Completed)
  todayCreatedWos.forEach(wo => {
    const bId = wo._id ? wo._id.toString() : "null";
    if (metricsByBranch[bId]) {
      metricsByBranch[bId].metrics.workshop.createdWorkOrders = wo.count;
    }
  });

  todayCompletedWos.forEach(wo => {
    const bId = wo._id ? wo._id.toString() : "null";
    if (metricsByBranch[bId]) {
      metricsByBranch[bId].metrics.workshop.completedWorkOrders = wo.count;
    }
  });

  return Object.values(metricsByBranch);
};
