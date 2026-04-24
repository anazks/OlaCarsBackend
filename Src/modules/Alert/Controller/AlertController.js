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
 * Manually triggers the insurance expiry check.
 * @route POST /api/alerts/check-insurance
 * @access Private (Admin)
 */
const runManualInsuranceCheck = async (req, res) => {
    try {
        const { Vehicle } = require("../../Vehicle/Model/VehicleModel");
        const { checkAndCreateInsuranceAlert } = require("../Service/AlertService");

        const vehicles = await Vehicle.find({
            isDeleted: false,
            status: { $nin: ["RETIRED", "TRANSFER COMPLETE"] }
        });

        for (const vehicle of vehicles) {
            await checkAndCreateInsuranceAlert(vehicle);
        }

        return res.status(200).json({
            success: true,
            message: "Manual insurance check completed successfully",
        });
    } catch (error) {
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
    runManualInsuranceCheck,
};
