const cron = require("node-cron");

/**
 * Initializes the alert scheduler.
 * 1. Runs insurance and maintenance checks hourly.
 * 2. Runs midnight cron job at 00:00 to fetch Tracksolid GPS odometer end values,
 *    sync vehicle current odometer, and calculate critical/due maintenance alerts.
 */
const initAlertScheduler = () => {
    // 1. Hourly general check
    cron.schedule("0 * * * *", async () => {
        try {
            const { runPeriodicVehicleChecks } = require("./AlertService");
            await runPeriodicVehicleChecks();
        } catch (error) {
            console.error("[CRON] Error during vehicle check:", error.message);
        }
    });

    // 2. Daily Midnight Cron Job at 00:00:
    // Fetches GPS odometer end value from Tracksolid, syncs vehicle odometer,
    // checks maintenance tracking, and calculates Critical / Due lists
    cron.schedule("0 0 * * *", async () => {
        try {
            console.log("[CRON] Running daily midnight GPS odometer & maintenance tracking job...");
            const { runMidnightGpsOdometerAndMaintenanceSync } = require("./AlertService");
            await runMidnightGpsOdometerAndMaintenanceSync();
        } catch (error) {
            console.error("[CRON] Error during midnight GPS & maintenance sync:", error.message);
        }
    });

    console.log("[CRON] Alert Scheduler initialized (Hourly Checks + Midnight GPS Maintenance Sync)");
};

module.exports = { initAlertScheduler };
