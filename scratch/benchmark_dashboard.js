require('dotenv').config();
const mongoose = require('mongoose');
const DashboardService = require('../Src/modules/Dashboard/Service/DashboardService');

async function benchmark() {
  try {
    console.log("Connecting to MongoDB...");
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected.");

    const filters = {}; // Empty filters simulating global admin / country manager with all branches

    console.log("Starting benchmark...");
    
    const startAll = Date.now();

    console.time("getSummaryStats");
    await DashboardService.getSummaryStats(filters);
    console.timeEnd("getSummaryStats");

    console.time("getRevenueOverview");
    await DashboardService.getRevenueOverview(filters);
    console.timeEnd("getRevenueOverview");

    console.time("getRecentOverduePayments");
    await DashboardService.getRecentOverduePayments(filters);
    console.timeEnd("getRecentOverduePayments");

    console.time("getVehicleMovement");
    await DashboardService.getVehicleMovement(filters);
    console.timeEnd("getVehicleMovement");

    console.log(`Total benchmark time: ${Date.now() - startAll}ms`);

  } catch (error) {
    console.error("Benchmark error:", error);
  } finally {
    await mongoose.disconnect();
  }
}

benchmark();
