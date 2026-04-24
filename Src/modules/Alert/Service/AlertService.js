const { 
    createAlertRepo, 
    findActiveAlertRepo, 
    resolveAlertByVehicleAndTypeRepo 
} = require("../Repo/AlertRepo");

/**
 * Checks and creates a maintenance alert if needed.
 * @param {Object} vehicle 
 */
const checkAndCreateMaintenanceAlert = async (vehicle) => {
    const { odometer } = vehicle.basicDetails || {};
    const { maintenanceThresholdKm, lastMaintenanceOdometer } = vehicle.maintenanceDetails || {};
    
    const threshold = maintenanceThresholdKm || 1000;
    const lastOdo = lastMaintenanceOdometer || 0;

    if (odometer >= lastOdo + threshold) {
        // Check if an active alert already exists
        const existing = await findActiveAlertRepo(vehicle._id, "MAINTENANCE");
        if (!existing) {
            await createAlertRepo({
                type: "MAINTENANCE",
                vehicleId: vehicle._id,
                priority: "HIGH",
                message: `Vehicle ${vehicle.basicDetails.make} ${vehicle.basicDetails.model} (${vehicle.basicDetails.vin}) has reached ${odometer}km. Service is due!`,
                metadata: {
                    currentOdometer: odometer,
                    lastMaintenanceOdometer: lastOdo,
                    threshold: threshold
                }
            });
            console.log(`[ALERT] Maintenance alert created for Vehicle: ${vehicle._id}`);
        }
    }
};

/**
 * Checks and creates an insurance alert if needed.
 * @param {Object} vehicle 
 */
const checkAndCreateInsuranceAlert = async (vehicle) => {
    const { toDate } = vehicle.insuranceDetails || {};
    if (!toDate) return;

    const expiryDate = new Date(toDate);
    const today = new Date();
    const diffTime = expiryDate - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays <= 30) {
        const existing = await findActiveAlertRepo(vehicle._id, "INSURANCE");
        if (!existing) {
            await createAlertRepo({
                type: "INSURANCE",
                vehicleId: vehicle._id,
                priority: diffDays <= 7 ? "HIGH" : "MEDIUM",
                message: `Insurance for ${vehicle.basicDetails.make} ${vehicle.basicDetails.model} (${vehicle.basicDetails.vin}) expires in ${diffDays} days (${expiryDate.toDateString()}).`,
                metadata: {
                    expiryDate: expiryDate,
                    daysRemaining: diffDays
                }
            });
            console.log(`[ALERT] Insurance alert created for Vehicle: ${vehicle._id}`);
        }
    }
};

/**
 * Runs periodic checks for all active vehicles (Insurance & Maintenance).
 */
const runPeriodicVehicleChecks = async () => {
    const { Vehicle } = require("../../Vehicle/Model/VehicleModel");
    
    console.log("[CRON-SERVICE] Starting periodic vehicle checks...");
    const vehicles = await Vehicle.find({
        isDeleted: false,
        status: { $nin: ["RETIRED", "TRANSFER COMPLETE"] }
    });

    let insuranceCount = 0;
    let maintenanceCount = 0;

    for (const vehicle of vehicles) {
        await checkAndCreateInsuranceAlert(vehicle);
        await checkAndCreateMaintenanceAlert(vehicle);
    }
    
    console.log(`[CRON-SERVICE] Periodic vehicle checks completed for ${vehicles.length} vehicles.`);
    return {
        vehicleCount: vehicles.length
    };
};

module.exports = {
    checkAndCreateMaintenanceAlert,
    checkAndCreateInsuranceAlert,
    resolveMaintenanceAlerts,
    runPeriodicVehicleChecks,
};
