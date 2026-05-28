const { getActiveAlertsRepo, getAllAlertsRepo, resolveAlertRepo } = require("../Repo/AlertRepo");
const { ROLES } = require("../../../shared/constants/roles");

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

        // Role-based filtering
        const user = req.user;
        if (user.role === ROLES.COUNTRYMANAGER) {
            filters.country = user.country;
        } else if ([ROLES.BRANCHMANAGER, ROLES.OPERATIONSTAFF, ROLES.FINANCESTAFF].includes(user.role)) {
            filters.branchId = user.branchId;
        }

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

        // Role-based filtering
        const user = req.user;
        if (user.role === ROLES.COUNTRYMANAGER) {
            filters.country = user.country;
        } else if ([ROLES.BRANCHMANAGER, ROLES.OPERATIONSTAFF, ROLES.FINANCESTAFF].includes(user.role)) {
            filters.branchId = user.branchId;
        }

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

        if (alert.type === "MAINTENANCE") {
            const { Vehicle } = require("../../Vehicle/Model/VehicleModel");
            const vehicle = await Vehicle.findById(alert.vehicleId);
            if (vehicle && vehicle.status === "ACTIVE — MAINTENANCE") {
                vehicle.status = "ACTIVE — AVAILABLE";
                if (!vehicle.statusHistory) vehicle.statusHistory = [];
                vehicle.statusHistory.push({
                    status: "ACTIVE — AVAILABLE",
                    changedBy: req.user.id,
                    changedByRole: req.user.role,
                    notes: "Maintenance alert resolved. Vehicle restored to service."
                });
                await vehicle.save();
            }
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

/**
 * Manually create a maintenance alert from workshop (Pull Maintenance).
 * @route POST /api/alerts/pull-maintenance
 * @access Private (Workshop Manager/Staff)
 */
const createManualMaintenanceAlert = async (req, res) => {
    try {
        const { vehicleId, notes } = req.body;
        if (!vehicleId) {
            return res.status(400).json({ success: false, message: "vehicleId is required" });
        }

        const { Vehicle } = require("../../Vehicle/Model/VehicleModel");
        const vehicle = await Vehicle.findById(vehicleId).populate("purchaseDetails.branch");
        if (!vehicle) {
            return res.status(404).json({ success: false, message: "Vehicle not found" });
        }

        // Check for existing active workshop-pull alert
        const { findActiveAlertRepo, createAlertRepo } = require("../Repo/AlertRepo");
        const existing = await findActiveAlertRepo(vehicleId, "MAINTENANCE");
        if (existing && existing.metadata?.source === 'WORKSHOP_PULL') {
            return res.status(409).json({
                success: false,
                message: "A workshop maintenance alert is already active for this vehicle.",
            });
        }

        const odometer = vehicle.basicDetails?.odometer || 0;
        const threshold = vehicle.maintenanceDetails?.maintenanceThresholdKm || 1000;
        const lastOdo = vehicle.maintenanceDetails?.lastMaintenanceOdometer || 0;

        const alert = await createAlertRepo({
            type: "MAINTENANCE",
            vehicleId: vehicle._id,
            branchId: vehicle.purchaseDetails?.branch?._id || vehicle.purchaseDetails?.branch,
            country: vehicle.purchaseDetails?.branch?.country || "UNKNOWN",
            priority: "HIGH",
            message: `[Workshop] ${vehicle.basicDetails?.make || ''} ${vehicle.basicDetails?.model || ''} (${vehicle.basicDetails?.vin || 'N/A'}) has been flagged for maintenance service.${notes ? ' Notes: ' + notes : ''} Current odometer: ${odometer.toLocaleString()} KM.`,
            metadata: {
                source: "WORKSHOP_PULL",
                currentOdometer: odometer,
                lastMaintenanceOdometer: lastOdo,
                threshold: threshold,
                pulledBy: req.user.id,
                pulledByName: req.user.fullName || req.user.email,
                notes: notes || null,
            },
        });

        // Transition vehicle status to ACTIVE — MAINTENANCE
        vehicle.status = "ACTIVE — MAINTENANCE";
        if (!vehicle.statusHistory) vehicle.statusHistory = [];
        vehicle.statusHistory.push({
            status: "ACTIVE — MAINTENANCE",
            changedBy: req.user.id,
            changedByRole: req.user.role,
            notes: `Workshop pulled for maintenance. Notes: ${notes || 'None'}`
        });
        await vehicle.save();

        return res.status(201).json({
            success: true,
            data: alert,
            message: "Maintenance alert created successfully. The fleet management team has been notified.",
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = {
    getActiveAlerts,
    getAllAlerts,
    resolveAlert,
    runManualVehicleChecks,
    triggerCronChecks,
    createManualMaintenanceAlert,
};
