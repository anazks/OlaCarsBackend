require('dotenv').config();
const mongoose = require('mongoose');
const { Vehicle } = require('../Src/modules/Vehicle/Model/VehicleModel');
const { Driver } = require('../Src/modules/Driver/Model/DriverModel');
const { Invoice } = require('../Src/modules/Invoice/Model/InvoiceModel');
const { Alert } = require('../Src/modules/Alert/Model/AlertModel');
const Branch = require('../Src/modules/Branch/Model/BranchModel');
const LedgerEntry = require('../Src/modules/Ledger/Model/LedgerEntryModel');
const Bill = require('../Src/modules/Bill/Model/BillModel');
const { WorkOrder } = require('../Src/modules/WorkOrder/Model/WorkOrderModel');
const AccountingCode = require('../Src/modules/AccountingCode/Model/AccountingCodeModel');
const moment = require('moment');

// Optimized and parallelized computeMetrics function
async function computeMetricsParallel(date, branchId, country = null) {
  const startOfDay = moment(date).startOf("day").toDate();
  const endOfDay = moment(date).endOf("day").toDate();

  // Queries that do not depend on each other can run in parallel
  const incomeCodesPromise = AccountingCode.find({ category: "INCOME", isDeleted: false }).select("_id").lean();

  const activeWoQuery = {
    status: { $nin: ["CLOSED", "VEHICLE_RELEASED", "INVOICED", "CANCELLED"] },
    isDeleted: false
  };
  const alertQuery = { isDeleted: false, status: "ACTIVE" };
  const vehicleQuery = { isDeleted: false };
  const driverQuery = { isDeleted: false, status: "ACTIVE" };
  const vehicleMovementQuery = { isDeleted: false };
  const woCreatedQuery = { createdAt: { $gte: startOfDay, $lte: endOfDay }, isDeleted: false };
  const woCompletedQuery = { updatedAt: { $gte: startOfDay, $lte: endOfDay }, status: { $in: ["CLOSED", "VEHICLE_RELEASED", "INVOICED"] }, isDeleted: false };

  if (branchId) {
    activeWoQuery.branchId = branchId;
    alertQuery.branchId = branchId;
    vehicleQuery["purchaseDetails.branch"] = branchId;
    driverQuery.branch = branchId;
    vehicleMovementQuery["purchaseDetails.branch"] = branchId;
    woCreatedQuery.branchId = branchId;
    woCompletedQuery.branchId = branchId;
  } else {
    activeWoQuery.branchId = null;
    alertQuery.branchId = null;
    vehicleQuery["purchaseDetails.branch"] = null;
    driverQuery.branch = null;
    vehicleMovementQuery["purchaseDetails.branch"] = null;
    woCreatedQuery.branchId = null;
    woCompletedQuery.branchId = null;
  }

  // 1. Resolve income codes first to feed into revenue query, or we can resolve it in parallel if we fetch ledger entries first
  const incomeCodes = await incomeCodesPromise;
  const incomeCodeIds = incomeCodes.map(c => c._id);

  const ledgerMatch = {
    accountingCode: { $in: incomeCodeIds },
    entryDate: { $gte: startOfDay, $lte: endOfDay },
    branch: branchId || null
  };

  const invoiceMatch = {
    generatedAt: { $gte: startOfDay, $lte: endOfDay },
    isDeleted: false
  };

  // Get drivers list for outstanding collections
  const driversListPromise = Driver.find(branchId ? { branch: branchId, isDeleted: false } : { branch: null, isDeleted: false }).select("_id").lean();

  const billMatch = {
    createdAt: { $gte: startOfDay, $lte: endOfDay },
    branch: branchId || null
  };

  const totalPayablesMatch = {
    createdAt: { $lte: endOfDay },
    status: { $nin: ["PAID", "VOID"] },
    branch: branchId || null
  };

  const driversList = await driversListPromise;
  const driverIds = driversList.map(d => d._id);

  const invoiceMatchWithDrivers = branchId 
    ? { ...invoiceMatch, driver: { $in: driverIds } }
    : { ...invoiceMatch, $or: [{ driver: { $in: driverIds } }, { driver: null }] };

  // Run all main aggregations and counts in parallel
  const [
    totalRevAggr,
    outstandingAggr,
    payablesAggr,
    totalPayablesAggr,
    activeDriversCount,
    activeWoVehicles,
    vehicles,
    alertGrouping,
    vehiclesWithHistory,
    createdWorkOrders,
    completedWorkOrders
  ] = await Promise.all([
    LedgerEntry.aggregate([
      { $match: ledgerMatch },
      { $group: { _id: null, total: { $sum: "$amount" } } }
    ]),
    Invoice.aggregate([
      { $match: invoiceMatchWithDrivers },
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
    Vehicle.find(vehicleQuery).select("status _id").lean(),
    Alert.aggregate([
      { $match: alertQuery },
      { $group: { _id: "$priority", count: { $sum: 1 } } }
    ]),
    Vehicle.find(vehicleMovementQuery).select("statusHistory").lean(),
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

  const alerts = { CRITICAL: 0, MAJOR: 0, MINOR: 0 };
  alertGrouping.forEach(g => {
    if (g._id === "HIGH") alerts.CRITICAL = g.count;
    else if (g._id === "MEDIUM") alerts.MAJOR = g.count;
    else if (g._id === "LOW") alerts.MINOR = g.count;
  });

  const vehicleMovement = { removed: 0, returned: 0, sale: 0 };
  vehiclesWithHistory.forEach(v => {
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
      activeVehicles: fleetStatus.available + fleetStatus.rented,
      activeDrivers: activeDriversCount,
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
}

async function benchmark() {
  try {
    console.log("Connecting to MongoDB...");
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected.");

    const activeBranches = await Branch.find({ isDeleted: false });
    console.log(`Active branches count: ${activeBranches.length}`);

    const todayStart = moment().startOf("day");

    // Profile computing all branches in parallel
    console.time("PARALLEL computation of all branches for today");
    const promises = activeBranches.map(b => computeMetricsParallel(todayStart.toDate(), b._id, b.country));
    promises.push(computeMetricsParallel(todayStart.toDate(), null, null)); // Null branch
    const results = await Promise.all(promises);
    console.log(`Computed metrics for ${results.length} branches in parallel.`);
    console.timeEnd("PARALLEL computation of all branches for today");

  } catch (error) {
    console.error("Benchmark error:", error);
  } finally {
    await mongoose.disconnect();
  }
}

benchmark();
