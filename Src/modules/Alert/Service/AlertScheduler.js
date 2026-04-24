const cron = require("node-cron");

/**
 * Initializes the alert scheduler.
 * Runs insurance checks daily at midnight.
 */
const initAlertScheduler = () => {
    // Schedule task to run every hour
    cron.schedule("0 * * * *", async () => {
        try {
            const { runPeriodicVehicleChecks } = require("./AlertService");
            await runPeriodicVehicleChecks();
        } catch (error) {
            console.error("[CRON] Error during vehicle check:", error.message);
        }
    });

    console.log("[CRON] Alert Scheduler initialized (Daily Insurance Checks)");
};

module.exports = { initAlertScheduler };
