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

async function benchmark() {
  try {
    console.log("Connecting to MongoDB...");
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected.");

    const activeBranches = await Branch.find({ isDeleted: false }).lean();
    console.log(`Active branches count: ${activeBranches.length}`);

    const date = new Date();
    const startOfDay = moment(date).startOf("day").toDate();
    const endOfDay = moment(date).endOf("day").toDate();

    console.time("OPTIMIZED GLOBAL parallel fetch");

    // Start all optimized global fetches in parallel
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
      // 1. Income codes
      AccountingCode.find({ category: "INCOME", isDeleted: false }).select("_id").lean(),
      
      // 2. Active drivers count grouped by branch
      Driver.aggregate([
        { $match: { isDeleted: false, status: "ACTIVE" } },
        { $group: { _id: "$branch", count: { $sum: 1 } } }
      ]),

      // 3. Active alerts grouped by branch and priority
      Alert.aggregate([
        { $match: { isDeleted: false, status: "ACTIVE" } },
        { $group: { _id: { branchId: "$branchId", priority: "$priority" }, count: { $sum: 1 } } }
      ]),

      // 4. Active work orders (for maintenance vehicles check)
      WorkOrder.find({ status: { $nin: ["CLOSED", "VEHICLE_RELEASED", "INVOICED", "CANCELLED"] }, isDeleted: false }).select("vehicleId branchId").lean(),

      // 5. Today's ledger entries
      LedgerEntry.find({ entryDate: { $gte: startOfDay, $lte: endOfDay } }).select("amount branch accountingCode").lean(),

      // 6. Today's invoices
      Invoice.find({ generatedAt: { $gte: startOfDay, $lte: endOfDay }, isDeleted: false }).select("balance driver").lean(),

      // 7. Today's bills
      Bill.find({ createdAt: { $gte: startOfDay, $lte: endOfDay } }).select("balanceDue branch").lean(),

      // 8. Total payables (unpaid bills balance sum grouped by branch)
      Bill.aggregate([
        { $match: { status: { $nin: ["PAID", "VOID"] }, createdAt: { $lte: endOfDay } } },
        { $group: { _id: "$branch", total: { $sum: "$balanceDue" } } }
      ]),

      // 9. Today's created work orders
      WorkOrder.aggregate([
        { $match: { createdAt: { $gte: startOfDay, $lte: endOfDay }, isDeleted: false } },
        { $group: { _id: "$branchId", count: { $sum: 1 } } }
      ]),

      // 10. Today's completed work orders
      WorkOrder.aggregate([
        { $match: { updatedAt: { $gte: startOfDay, $lte: endOfDay }, status: { $in: ["CLOSED", "VEHICLE_RELEASED", "INVOICED"] }, isDeleted: false } },
        { $group: { _id: "$branchId", count: { $sum: 1 } } }
      ]),

      // 11. Vehicle status counts grouped by branch and status (to avoid fetching all vehicles)
      Vehicle.aggregate([
        { $match: { isDeleted: false } },
        { $group: { _id: { branch: "$purchaseDetails.branch", status: "$status" }, count: { $sum: 1 } } }
      ]),

      // 12. Vehicle movements today (to avoid statusHistory on all vehicles)
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

    console.timeEnd("OPTIMIZED GLOBAL parallel fetch");

    console.time("JS Memory Aggregation");

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
      metricsByBranch[bId] = {
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
      };
    });

    // 1. Revenue
    todayLedgers.forEach(l => {
      if (incomeCodeIdsSet.has(l.accountingCode.toString())) {
        const bId = l.branch ? l.branch.toString() : "null";
        if (metricsByBranch[bId]) {
          metricsByBranch[bId].revenue += l.amount || 0;
        }
      }
    });

    // 2. Outstanding Collections
    todayInvoices.forEach(inv => {
      if (inv.driver) {
        const bId = driverToBranchMap[inv.driver.toString()] || "null";
        if (metricsByBranch[bId]) {
          metricsByBranch[bId].outstandingCollections += inv.balance || 0;
        }
      } else {
        metricsByBranch["null"].outstandingCollections += inv.balance || 0;
      }
    });

    // 3. Payables
    todayBills.forEach(b => {
      const bId = b.branch ? b.branch.toString() : "null";
      if (metricsByBranch[bId]) {
        metricsByBranch[bId].payables += b.balanceDue || 0;
      }
    });

    // 4. Total Payables
    unpaidBillsAggr.forEach(b => {
      const bId = b._id ? b._id.toString() : "null";
      if (metricsByBranch[bId]) {
        metricsByBranch[bId].totalPayables = b.total || 0;
      }
    });

    // 5. Active Drivers
    activeDriversAggr.forEach(d => {
      const bId = d._id ? d._id.toString() : "null";
      if (metricsByBranch[bId]) {
        metricsByBranch[bId].activeDrivers = d.count;
      }
    });

    // 6. Fleet Status & Active Vehicles
    vehicleStatusAggr.forEach(v => {
      const bId = v._id.branch ? v._id.branch.toString() : "null";
      if (!metricsByBranch[bId]) return;

      const s = v._id.status;
      const count = v.count;

      if (s === "ACTIVE — AVAILABLE") metricsByBranch[bId].fleetStatus.available += count;
      else if (s === "ACTIVE — RENTED" || s === "W. GROUP ACTIVE") metricsByBranch[bId].fleetStatus.rented += count;
      else if (s === "ACTIVE — MAINTENANCE" || s === "REPAIR IN PROGRESS") metricsByBranch[bId].fleetStatus.maintenance += count;
      else if (s === "RETIRED") metricsByBranch[bId].fleetStatus.retired += count;
      else metricsByBranch[bId].fleetStatus.other += count;
    });

    // Adjust for active work order maintenance vehicles (re-categorize them to maintenance status)
    maintenanceVehicles.forEach(mv => {
      const bId = mv.purchaseDetails?.branch ? mv.purchaseDetails.branch.toString() : "null";
      if (!metricsByBranch[bId]) return;

      const s = mv.status;
      // Subtract from original category
      if (s === "ACTIVE — AVAILABLE" && metricsByBranch[bId].fleetStatus.available > 0) metricsByBranch[bId].fleetStatus.available -= 1;
      else if ((s === "ACTIVE — RENTED" || s === "W. GROUP ACTIVE") && metricsByBranch[bId].fleetStatus.rented > 0) metricsByBranch[bId].fleetStatus.rented -= 1;
      else if ((s === "ACTIVE — MAINTENANCE" || s === "REPAIR IN PROGRESS") && metricsByBranch[bId].fleetStatus.maintenance > 0) metricsByBranch[bId].fleetStatus.maintenance -= 1;
      else if (s === "RETIRED" && metricsByBranch[bId].fleetStatus.retired > 0) metricsByBranch[bId].fleetStatus.retired -= 1;
      else if (metricsByBranch[bId].fleetStatus.other > 0) metricsByBranch[bId].fleetStatus.other -= 1;

      // Add to maintenance category
      metricsByBranch[bId].fleetStatus.maintenance += 1;
    });

    branchIds.forEach(bId => {
      const fs = metricsByBranch[bId].fleetStatus;
      metricsByBranch[bId].activeVehicles = fs.available + fs.rented;
    });

    // 7. Alerts
    alertsAggr.forEach(a => {
      const bId = a._id.branchId ? a._id.branchId.toString() : "null";
      if (metricsByBranch[bId]) {
        if (a._id.priority === "HIGH") metricsByBranch[bId].alerts.CRITICAL += a.count;
        else if (a._id.priority === "MEDIUM") metricsByBranch[bId].alerts.MAJOR += a.count;
        else if (a._id.priority === "LOW") metricsByBranch[bId].alerts.MINOR += a.count;
      }
    });

    // 8. Vehicle Movement
    vehicleMovementAggr.forEach(vm => {
      const bId = vm._id.branch ? vm._id.branch.toString() : "null";
      if (metricsByBranch[bId]) {
        const s = vm._id.status;
        const count = vm.count;
        if (s === "ACTIVE — RENTED") metricsByBranch[bId].vehicleMovement.sale += count;
        else if (s === "ACTIVE — AVAILABLE") metricsByBranch[bId].vehicleMovement.returned += count;
        else if (s === "RETIRED" || s === "SUSPENDED") metricsByBranch[bId].vehicleMovement.removed += count;
      }
    });

    // 9. Workshop (Created / Completed)
    todayCreatedWos.forEach(wo => {
      const bId = wo._id ? wo._id.toString() : "null";
      if (metricsByBranch[bId]) {
        metricsByBranch[bId].workshop.createdWorkOrders = wo.count;
      }
    });

    todayCompletedWos.forEach(wo => {
      const bId = wo._id ? wo._id.toString() : "null";
      if (metricsByBranch[bId]) {
        metricsByBranch[bId].workshop.completedWorkOrders = wo.count;
      }
    });

    console.timeEnd("JS Memory Aggregation");

    console.log("Calculated metrics for branch 6a293ea52cb35dd4717a1064:", metricsByBranch["6a293ea52cb35dd4717a1064"]);

  } catch (error) {
    console.error("Benchmark error:", error);
  } finally {
    await mongoose.disconnect();
  }
}

benchmark();
