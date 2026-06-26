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

  // 1. Revenue
  const incomeCodes = await AccountingCode.find({ category: "INCOME", isDeleted: false }).select("_id");
  const incomeCodeIds = incomeCodes.map(c => c._id);
  
  const ledgerMatch = {
    accountingCode: { $in: incomeCodeIds },
    entryDate: { $gte: startOfDay, $lte: endOfDay },
    isDeleted: { $ne: true }
  };
  if (branchId) {
    ledgerMatch.branch = branchId;
  } else {
    ledgerMatch.branch = null;
  }

  const totalRevAggr = await LedgerEntry.aggregate([
    { $match: ledgerMatch },
    { $group: { _id: null, total: { $sum: "$amount" } } }
  ]);
  const revenue = totalRevAggr.length > 0 ? totalRevAggr[0].total : 0;

  // 2. Outstanding Collections
  const invoiceMatch = {
    generatedAt: { $gte: startOfDay, $lte: endOfDay },
    isDeleted: false
  };
  
  let outstandingAggr;
  if (branchId) {
    outstandingAggr = await Invoice.aggregate([
      { $match: invoiceMatch },
      {
        $lookup: {
          from: "drivers",
          localField: "driver",
          foreignField: "_id",
          as: "driverDoc"
        }
      },
      { $unwind: "$driverDoc" },
      { $match: { "driverDoc.branch": branchId } },
      { $group: { _id: null, total: { $sum: "$balance" } } }
    ]);
  } else {
    outstandingAggr = await Invoice.aggregate([
      { $match: invoiceMatch },
      {
        $lookup: {
          from: "drivers",
          localField: "driver",
          foreignField: "_id",
          as: "driverDoc"
        }
      },
      { $unwind: { path: "$driverDoc", preserveNullAndEmptyArrays: true } },
      { $match: { $or: [{ driverDoc: { $exists: false } }, { "driverDoc.branch": null }] } },
      { $group: { _id: null, total: { $sum: "$balance" } } }
    ]);
  }
  const outstandingCollections = outstandingAggr.length > 0 ? outstandingAggr[0].total : 0;

  // 3. Payables (Daily bill creation)
  const billMatch = {
    createdAt: { $gte: startOfDay, $lte: endOfDay },
    isDeleted: { $ne: true }
  };
  if (branchId) {
    billMatch.branchId = branchId;
  } else {
    billMatch.branchId = null;
  }

  const payablesAggr = await Bill.aggregate([
    { $match: billMatch },
    { $group: { _id: null, total: { $sum: "$balanceDue" } } }
  ]);
  const payables = payablesAggr.length > 0 ? payablesAggr[0].total : 0;

  // 4. Total Payables (Cumulative unpaid bills as of end of this day)
  const totalPayablesMatch = {
    createdAt: { $lte: endOfDay },
    status: { $nin: ["PAID", "VOID"] },
    isDeleted: { $ne: true }
  };
  if (branchId) {
    totalPayablesMatch.branchId = branchId;
  } else {
    totalPayablesMatch.branchId = null;
  }

  const totalPayablesAggr = await Bill.aggregate([
    { $match: totalPayablesMatch },
    { $group: { _id: null, total: { $sum: "$balanceDue" } } }
  ]);
  const totalPayables = totalPayablesAggr.length > 0 ? totalPayablesAggr[0].total : 0;

  // 5. Active Vehicles, Active Drivers, Fleet Status
  const vehicleQuery = { isDeleted: false };
  const baseQuery = { isDeleted: false };
  const alertQuery = { isDeleted: false, status: "ACTIVE" };
  const activeWoQuery = {
    status: { $nin: ["CLOSED", "VEHICLE_RELEASED", "INVOICED", "CANCELLED"] },
    isDeleted: false
  };

  if (branchId) {
    vehicleQuery["purchaseDetails.branch"] = branchId;
    baseQuery.branch = branchId;
    alertQuery.branchId = branchId;
    activeWoQuery.branchId = branchId;
  } else {
    vehicleQuery["purchaseDetails.branch"] = null;
    baseQuery.branch = null;
    alertQuery.branchId = null;
    activeWoQuery.branchId = null;
  }

  const activeDrivers = await Driver.countDocuments({ ...baseQuery, status: "ACTIVE" });

  const activeWoVehicles = await WorkOrder.distinct("vehicleId", activeWoQuery);
  const maintenanceVehicleIds = new Set(activeWoVehicles.map(id => id.toString()));

  const vehicles = await Vehicle.find(vehicleQuery).select("status _id").lean();
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

  // 6. Alerts
  const alertGrouping = await Alert.aggregate([
    { $match: alertQuery },
    { $group: { _id: "$priority", count: { $sum: 1 } } }
  ]);
  const alerts = { CRITICAL: 0, MAJOR: 0, MINOR: 0 };
  alertGrouping.forEach(g => {
    if (g._id === "HIGH") alerts.CRITICAL = g.count;
    else if (g._id === "MEDIUM") alerts.MAJOR = g.count;
    else if (g._id === "LOW") alerts.MINOR = g.count;
  });

  // 7. Vehicle Movement (Status history entries on this day)
  const vehicleMovementQuery = { isDeleted: false };
  if (branchId) {
    vehicleMovementQuery["purchaseDetails.branch"] = branchId;
  } else {
    vehicleMovementQuery["purchaseDetails.branch"] = null;
  }
  const vehiclesWithHistory = await Vehicle.find(vehicleMovementQuery).select("statusHistory").lean();
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

  // 8. Workshop Work Orders (Created & Completed on this day)
  const woCreatedQuery = {
    createdAt: { $gte: startOfDay, $lte: endOfDay },
    isDeleted: false
  };
  const woCompletedQuery = {
    updatedAt: { $gte: startOfDay, $lte: endOfDay },
    status: { $in: ["CLOSED", "VEHICLE_RELEASED", "INVOICED"] },
    isDeleted: false
  };

  if (branchId) {
    woCreatedQuery.branchId = branchId;
    woCompletedQuery.branchId = branchId;
  } else {
    woCreatedQuery.branchId = null;
    woCompletedQuery.branchId = null;
  }

  const createdWorkOrders = await WorkOrder.countDocuments(woCreatedQuery);
  const completedWorkOrders = await WorkOrder.countDocuments(woCompletedQuery);

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
