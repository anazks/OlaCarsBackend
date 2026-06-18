require("dotenv").config();
const mongoose = require("mongoose");
const connectDB = require("../config/dbConfig");
const { precomputeForDateRange } = require("../modules/Dashboard/Service/DashboardPrecomputeService");
const moment = require("moment");

const run = async () => {
  try {
    console.log("Connecting to database...");
    await connectDB();
    console.log("Database connected successfully!");

    // Start from Jan 1, 2025
    const startDate = moment("2025-01-01").startOf("day").toDate();
    // End at yesterday (since today is computed on the fly)
    const endDate = moment().subtract(1, "day").startOf("day").toDate();

    console.log(`Starting historical precomputation from ${startDate.toISOString().split("T")[0]} to ${endDate.toISOString().split("T")[0]}...`);
    
    const startTime = Date.now();
    await precomputeForDateRange(startDate, endDate);
    const endTime = Date.now();

    console.log(`Precomputation successfully finished in ${((endTime - startTime) / 1000).toFixed(2)} seconds!`);
    process.exit(0);
  } catch (error) {
    console.error("Critical error running precomputation script:", error);
    process.exit(1);
  }
};

run();
