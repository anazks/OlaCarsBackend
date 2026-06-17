const cron = require("node-cron");
const { precomputeYesterdayAndToday } = require("./DashboardPrecomputeService");

const startDashboardCronJob = () => {
  // Run daily at 12:05 AM
  cron.schedule("5 0 * * *", async () => {
    console.log("[DashboardCronService] Running daily dashboard precomputation...");
    try {
      await precomputeYesterdayAndToday();
      console.log("[DashboardCronService] Dashboard precomputation successful!");
    } catch (err) {
      console.error("[DashboardCronService] Dashboard precomputation error:", err);
    }
  });
  console.log("[DashboardCronService] Dashboard precomputation daily cron scheduler registered");
};

exports.startDashboardCronJob = startDashboardCronJob;
