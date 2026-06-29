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

    // Create compound index for LedgerEntry if it doesn't exist
    const db = mongoose.connection.db;
    console.log("Creating compound index on ledgerentries...");
    await db.collection('ledgerentries').createIndex({ branch: 1, entryDate: 1, accountingCode: 1 });
    await db.collection('ledgerentries').createIndex({ entryDate: 1, accountingCode: 1 });
    console.log("Indexes created.");

    const activeBranches = await Branch.find({ isDeleted: false });
    const branchId = activeBranches[0]._id;
    console.log(`Profiling OPTIMIZED queries for branch: ${branchId}`);

    const date = new Date();
    const startOfDay = moment(date).startOf("day").toDate();
    const endOfDay = moment(date).endOf("day").toDate();

    // 1. Revenue
    console.time("Step 1: Revenue (OPTIMIZED)");
    const incomeCodes = await AccountingCode.find({ category: "INCOME", isDeleted: false }).select("_id");
    const incomeCodeIds = incomeCodes.map(c => c._id);
    const ledgerMatch = {
      accountingCode: { $in: incomeCodeIds },
      entryDate: { $gte: startOfDay, $lte: endOfDay },
      branch: branchId
    };
    const totalRevAggr = await LedgerEntry.aggregate([
      { $match: ledgerMatch },
      { $group: { _id: null, total: { $sum: "$amount" } } }
    ]);
    console.timeEnd("Step 1: Revenue (OPTIMIZED)");

    // 2. Outstanding Collections
    console.time("Step 2: Outstanding Collections (OPTIMIZED)");
    const invoiceMatch = {
      generatedAt: { $gte: startOfDay, $lte: endOfDay },
      isDeleted: false
    };
    const driversList = await Driver.find({ branch: branchId, isDeleted: false }).select("_id").lean();
    const driverIds = driversList.map(d => d._id);
    const outstandingAggr = await Invoice.aggregate([
      { $match: { ...invoiceMatch, driver: { $in: driverIds } } },
      { $group: { _id: null, total: { $sum: "$balance" } } }
    ]);
    console.timeEnd("Step 2: Outstanding Collections (OPTIMIZED)");

    // 3. Payables
    console.time("Step 3: Payables (OPTIMIZED)");
    const billMatch = {
      createdAt: { $gte: startOfDay, $lte: endOfDay },
      branch: branchId
    };
    const payablesAggr = await Bill.aggregate([
      { $match: billMatch },
      { $group: { _id: null, total: { $sum: "$balanceDue" } } }
    ]);
    console.timeEnd("Step 3: Payables (OPTIMIZED)");

    // 4. Total Payables
    console.time("Step 4: Total Payables (OPTIMIZED)");
    const totalPayablesMatch = {
      createdAt: { $lte: endOfDay },
      status: { $nin: ["PAID", "VOID"] },
      branch: branchId
    };
    const totalPayablesAggr = await Bill.aggregate([
      { $match: totalPayablesMatch },
      { $group: { _id: null, total: { $sum: "$balanceDue" } } }
    ]);
    console.timeEnd("Step 4: Total Payables (OPTIMIZED)");

    // 5. Active Drivers, WorkOrders distinct, Vehicles find (status, _id)
    console.time("Step 5: Vehicles & Drivers info (OPTIMIZED)");
    const vehicleQuery = { isDeleted: false, "purchaseDetails.branch": branchId };
    const baseQuery = { isDeleted: false, branch: branchId };
    const activeWoQuery = {
      status: { $nin: ["CLOSED", "VEHICLE_RELEASED", "INVOICED", "CANCELLED"] },
      branchId: branchId
    };
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
    console.timeEnd("Step 5: Vehicles & Drivers info (OPTIMIZED)");

  } catch (error) {
    console.error("Benchmark error:", error);
  } finally {
    await mongoose.disconnect();
  }
}

benchmark();
