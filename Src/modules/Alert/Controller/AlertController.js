const { getActiveAlertsRepo, getAllAlertsRepo, resolveAlertRepo } = require("../Repo/AlertRepo");

/**
 * Gets all active alerts.
 * @route GET /api/alerts
 * @access Private (Admin/Managers)
 */
const getActiveAlerts = async (req, res) => {
    try {
        const filters = {};
        if (req.query.type) filters.type = req.query.type;
        if (req.query.vehicleId) filters.vehicleId = req.query.vehicleId;

        const alerts = await getActiveAlertsRepo(filters);
        return res.status(200).json({
            success: true,
            data: alerts,
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message,
        });
    }
};

/**
 * Gets all alerts (including resolved and dismissed).
 * @route GET /api/alerts/all
 * @access Private (Admin/Managers)
 */
const getAllAlerts = async (req, res) => {
    try {
        const filters = {};
        if (req.query.type) filters.type = req.query.type;
        if (req.query.vehicleId) filters.vehicleId = req.query.vehicleId;
        if (req.query.status) filters.status = req.query.status;

        const alerts = await getAllAlertsRepo(filters);
        return res.status(200).json({
            success: true,
            data: alerts,
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message,
        });
    }
};

/**
 * Resolves a specific alert.
 * @route PUT /api/alerts/:id/resolve
 * @access Private (Admin/Managers)
 */
const resolveAlert = async (req, res) => {
    try {
        const { id } = req.params;
        const alert = await resolveAlertRepo(id, req.user.id);

        if (!alert) {
            return res.status(404).json({
                success: false,
                message: "Alert not found",
            });
        }

        return res.status(200).json({
            success: true,
            data: alert,
            message: "Alert resolved successfully",
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message,
        });
    }
};

/**
 * Manually triggers all vehicle checks (Insurance & Maintenance).
 * @route POST /api/alerts/check-all
 * @access Private (Admin)
 */
const runManualVehicleChecks = async (req, res) => {
    try {
        const { runPeriodicVehicleChecks } = require("../Service/AlertService");
        const result = await runPeriodicVehicleChecks();

        return res.status(200).json({
            success: true,
            message: "Manual vehicle checks completed successfully",
            data: result
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message,
        });
    }
};

/**
 * Endpoint for external cron service to trigger periodic checks.
 * @route POST /api/alerts/cron-trigger
 * @access Public (Protected by secret header)
 */
const triggerCronChecks = async (req, res) => {
    try {
        const cronSecret = process.env.CRON_SECRET;
        const incomingSecret = req.headers["x-cron-secret"];

        if (cronSecret && incomingSecret !== cronSecret) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized: Invalid cron secret",
            });
        }

        const { runPeriodicVehicleChecks } = require("../Service/AlertService");
        const result = await runPeriodicVehicleChecks();

        return res.status(200).json({
            success: true,
            message: "Cron vehicle checks triggered successfully",
            data: result
        });
    } catch (error) {
        console.error("[CRON-CONTROLLER] Error triggering checks:", error.message);
        return res.status(500).json({
            success: false,
            message: error.message,
        });
    }
};

module.exports = {
    getActiveAlerts,
    getAllAlerts,
    resolveAlert,
    runManualVehicleChecks,
    triggerCronChecks,
};
