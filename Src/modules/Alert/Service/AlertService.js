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
 * Resolves maintenance alerts for a vehicle (usually when a preventive service is done).
 * @param {string} vehicleId 
 * @param {string} userId 
 */
const resolveMaintenanceAlerts = async (vehicleId, userId) => {
    return await resolveAlertByVehicleAndTypeRepo(vehicleId, "MAINTENANCE", userId);
};

module.exports = {
    checkAndCreateMaintenanceAlert,
    checkAndCreateInsuranceAlert,
    resolveMaintenanceAlerts,
};
