const cron = require("node-cron");
const { Vehicle } = require("../../Vehicle/Model/VehicleModel");
const { checkAndCreateInsuranceAlert, checkAndCreateMaintenanceAlert } = require("./AlertService");

/**
 * Initializes the alert scheduler.
 * Runs insurance checks daily at midnight.
 */
const initAlertScheduler = () => {
    // Schedule task to run every minute for testing
    cron.schedule("* * * * *", async () => {
        console.log("[CRON] Running periodic vehicle checks (Insurance & Maintenance)...");
        try {
            const vehicles = await Vehicle.find({
                isDeleted: false,
                status: { $nin: ["RETIRED", "TRANSFER COMPLETE"] }
            });

            for (const vehicle of vehicles) {
                await checkAndCreateInsuranceAlert(vehicle);
                await checkAndCreateMaintenanceAlert(vehicle);
            }
            console.log("[CRON] Periodic vehicle checks completed.");
        } catch (error) {
            console.error("[CRON] Error during vehicle check:", error.message);
        }
    });

    console.log("[CRON] Alert Scheduler initialized (Daily Insurance Checks)");
};

module.exports = { initAlertScheduler };
