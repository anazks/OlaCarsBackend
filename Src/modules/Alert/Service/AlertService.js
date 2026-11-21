const { 
    createAlertRepo, 
    findActiveAlertRepo, 
    resolveAlertByVehicleAndTypeRepo 
} = require("../Repo/AlertRepo");
const SystemSettings = require("../../SystemSettings/Model/SystemSettingsModel");

/**
 * Helper to fetch system settings with fallback defaults.
 */
const getSystemMaintenanceSettings = async () => {
    let thresholdKm = 1000;
    let warningPercent = 0.8;
    try {
        const thresholdDoc = await SystemSettings.findOne({ key: "maintenanceThresholdKm" });
        if (thresholdDoc && !isNaN(Number(thresholdDoc.value))) {
            thresholdKm = Number(thresholdDoc.value);
        }
        const warningDoc = await SystemSettings.findOne({ key: "maintenanceWarningPercent" });
        if (warningDoc && !isNaN(Number(warningDoc.value))) {
            warningPercent = Number(warningDoc.value);
        }
    } catch (err) {
        console.warn("[ALERT-SERVICE] Failed to read system maintenance settings, using defaults:", err.message);
    }
    return { thresholdKm, warningPercent };
};

/**
 * Checks and creates a maintenance alert if needed.
 * @param {Object} vehicle 
 * @param {Object} defaultSettings
 */
const checkAndCreateMaintenanceAlert = async (vehicle, defaultSettings = null) => {
    const { thresholdKm: sysThreshold, warningPercent: sysWarning } = defaultSettings || await getSystemMaintenanceSettings();
    const { odometer } = vehicle.basicDetails || {};
    const { maintenanceThresholdKm, lastMaintenanceOdometer } = vehicle.maintenanceDetails || {};
    
    const threshold = (maintenanceThresholdKm !== undefined && maintenanceThresholdKm !== null && Number(maintenanceThresholdKm) > 0)
        ? Number(maintenanceThresholdKm)
        : sysThreshold;
    const lastOdo = Number(lastMaintenanceOdometer || 0);
    const currentOdo = Number(odometer || 0);
    const distanceSinceService = Math.max(0, currentOdo - lastOdo);
    const warningDistance = threshold * sysWarning;

    const plate = vehicle.legalDocs?.registrationNumber || vehicle.basicDetails?.plateNumber || vehicle.basicDetails?.fleetNumber || "N/A";
    const makeModel = `${vehicle.basicDetails?.make || ''} ${vehicle.basicDetails?.model || ''}`.trim();
    const vin = vehicle.basicDetails?.vin || '—';

    if (distanceSinceService >= threshold) {
        // CRITICAL: Reached maintenance threshold
        const existing = await findActiveAlertRepo(vehicle._id, "MAINTENANCE");
        if (!existing) {
            await createAlertRepo({
                type: "MAINTENANCE",
                vehicleId: vehicle._id,
                branchId: vehicle.purchaseDetails?.branch?._id || vehicle.purchaseDetails?.branch,
                country: vehicle.purchaseDetails?.branch?.country || "UNKNOWN",
                priority: "CRITICAL",
                message: `CRITICAL: Vehicle ${plate} (${makeModel}) has reached maintenance threshold! Odometer: ${currentOdo.toLocaleString()} km, Distance since last service: ${distanceSinceService.toLocaleString()} km (Threshold: ${threshold.toLocaleString()} km). Work order required.`,
                metadata: {
                    currentOdometer: currentOdo,
                    lastMaintenanceOdometer: lastOdo,
                    threshold: threshold,
                    distanceSinceService: distanceSinceService,
                    serviceStatus: "OVERDUE",
                    severity: "CRITICAL",
                }
            });
            console.log(`[ALERT] Critical Maintenance Alert created for Vehicle ${plate} (${vehicle._id})`);
        }
    } else if (distanceSinceService >= warningDistance) {
        // DUE: Approaching maintenance threshold
        const existing = await findActiveAlertRepo(vehicle._id, "MAINTENANCE");
        if (!existing) {
            await createAlertRepo({
                type: "MAINTENANCE",
                vehicleId: vehicle._id,
                branchId: vehicle.purchaseDetails?.branch?._id || vehicle.purchaseDetails?.branch,
                country: vehicle.purchaseDetails?.branch?.country || "UNKNOWN",
                priority: "HIGH",
                message: `DUE: Vehicle ${plate} (${makeModel}) is approaching maintenance threshold! Odometer: ${currentOdo.toLocaleString()} km, Distance since last service: ${distanceSinceService.toLocaleString()} km / ${threshold.toLocaleString()} km. Service due soon.`,
                metadata: {
                    currentOdometer: currentOdo,
                    lastMaintenanceOdometer: lastOdo,
                    threshold: threshold,
                    distanceSinceService: distanceSinceService,
                    serviceStatus: "APPROACHING",
                    severity: "DUE",
                }
            });
            console.log(`[ALERT] Due Maintenance Alert created for Vehicle ${plate} (${vehicle._id})`);
        }
    } else {
        // Distance is OK — if a previous alert existed, it can be resolved if vehicle has been serviced
        const existing = await findActiveAlertRepo(vehicle._id, "MAINTENANCE");
        if (existing && existing.metadata?.lastMaintenanceOdometer !== lastOdo) {
            await resolveAlertByVehicleAndTypeRepo(vehicle._id, "MAINTENANCE", "SYSTEM_AUTO_RESOLVE");
            console.log(`[ALERT] Resolved previous maintenance alert for serviced Vehicle ${plate} (${vehicle._id})`);
        }
    }
};

/**
 * Checks and creates an insurance alert if needed.
 * @param {Object} vehicle 
 */
const checkAndCreateInsuranceAlert = async (vehicle) => {
    const { getVehiclePoliciesByVehicleIdService } = require("../../Insurance/Repo/VehiclePolicyRepo");
    const policies = await getVehiclePoliciesByVehicleIdService(vehicle._id);
    const activePolicy = policies.length > 0 ? policies[0] : null;

    if (!activePolicy || !activePolicy.expiryDate) return;

    const expiryDate = new Date(activePolicy.expiryDate);
    const today = new Date();
    const diffTime = expiryDate - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays <= 30 && diffDays >= -30) {
        const existing = await findActiveAlertRepo(vehicle._id, "INSURANCE");
        if (!existing) {
            await createAlertRepo({
                type: "INSURANCE",
                vehicleId: vehicle._id,
                branchId: vehicle.purchaseDetails.branch?._id || vehicle.purchaseDetails.branch,
                country: vehicle.purchaseDetails.branch?.country || "UNKNOWN",
                priority: diffDays <= 7 ? "HIGH" : "MEDIUM",
                message: diffDays < 0 
                    ? `Insurance for ${vehicle.basicDetails.make} ${vehicle.basicDetails.model} (${vehicle.basicDetails.vin}) EXPIRED ${Math.abs(diffDays)} days ago!`
                    : `Insurance for ${vehicle.basicDetails.make} ${vehicle.basicDetails.model} (${vehicle.basicDetails.vin}) expires in ${diffDays} days (${expiryDate.toDateString()}).`,
                metadata: {
                    expiryDate: expiryDate,
                    daysRemaining: diffDays,
                    policyId: activePolicy._id
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
    }).populate("purchaseDetails.branch");

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

/**
 * Resolves maintenance alerts for a vehicle (usually when a preventive service is done).
 * @param {string} vehicleId 
 * @param {string} userId 
 */
const resolveMaintenanceAlerts = async (vehicleId, userId) => {
    return await resolveAlertByVehicleAndTypeRepo(vehicleId, "MAINTENANCE", userId);
};

/**
 * Midnight Cron Job:
 * 1. Queries Tracksolid GPS API to fetch the latest odometer end value for each vehicle.
 * 2. Updates vehicle basicDetails.odometer and basicDetails.odometerReadingDate.
 * 3. Evaluates maintenance tracking against system settings / vehicle threshold.
 * 4. Automatically calculates and creates alerts for Critical (reached) and Due (approaching) vehicles.
 * 5. Resolves alerts for vehicles that have been serviced.
 */
const runMidnightGpsOdometerAndMaintenanceSync = async () => {
    console.log("[MIDNIGHT-CRON] Starting midnight GPS odometer fetch & maintenance tracking sync...");
    try {
        const { Vehicle } = require("../../Vehicle/Model/VehicleModel");
        const defaultSettings = await getSystemMaintenanceSettings();
        const { thresholdKm, warningPercent } = defaultSettings;

        console.log(`[MIDNIGHT-CRON] Active Settings — Threshold: ${thresholdKm} KM, Warning Ratio: ${warningPercent * 100}%`);

        // 1. Get today's start and end timestamps in YYYY-MM-DD HH:mm:ss format
        const now = new Date();
        const pad = (n) => String(n).padStart(2, "0");
        const todayDateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
        const startTime = `${todayDateStr} 00:00:00`;
        const endTime = `${todayDateStr} 23:59:59`;

        // 2. Fetch fleet summary with odometerEnd values from GpsService
        let summaryRows = [];
        try {
            const GpsService = require("../../Gps/Service/GpsService");
            const gpsServiceInstance = new GpsService();
            const report = await gpsServiceInstance.getFleetSummaryReport(startTime, endTime, "", 1, 5000);
            summaryRows = (report && Array.isArray(report.summaryRows)) ? report.summaryRows : [];
            console.log(`[MIDNIGHT-CRON] Retrieved GPS mileage/odometer data for ${summaryRows.length} vehicles.`);
        } catch (gpsErr) {
            console.error("[MIDNIGHT-CRON] GPS Report fetch error (will proceed with existing vehicle odometers):", gpsErr.message);
        }

        // Map IMEI and vehicleNumber to odometerEnd
        const odoEndByImei = new Map();
        const odoEndByPlate = new Map();
        summaryRows.forEach(row => {
            if (row.odometerEnd && Number(row.odometerEnd) > 0) {
                const endVal = Number(row.odometerEnd);
                if (row.imei) odoEndByImei.set(String(row.imei).trim(), endVal);
                if (row.vehicleNumber && row.vehicleNumber !== 'Unassigned') {
                    const cleanPlate = String(row.vehicleNumber).replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
                    odoEndByPlate.set(cleanPlate, endVal);
                }
            }
        });

        // 3. Query all active fleet vehicles
        const vehicles = await Vehicle.find({
            isDeleted: false,
            status: { $in: ["ACTIVE — AVAILABLE", "ACTIVE - AVAILABLE", "ACTIVE — RENTED", "ACTIVE - RENTED", "ACTIVE — MAINTENANCE", "ACTIVE - MAINTENANCE"] }
        }).populate("purchaseDetails.branch");

        console.log(`[MIDNIGHT-CRON] Processing maintenance tracking for ${vehicles.length} active fleet vehicles...`);

        const criticalList = [];
        const dueList = [];
        const okList = [];

        for (const vehicle of vehicles) {
            // Find updated odometerEnd from GPS data if available
            const plateClean = (vehicle.legalDocs?.registrationNumber || vehicle.basicDetails?.plateNumber || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
            const imei = vehicle.basicDetails?.gpsSerialNumber || vehicle.gpsSerialNumber;
            
            let latestOdometer = Number(vehicle.basicDetails?.odometer || 0);

            let matchedOdoEnd = null;
            if (imei && odoEndByImei.has(String(imei).trim())) {
                matchedOdoEnd = odoEndByImei.get(String(imei).trim());
            } else if (plateClean && odoEndByPlate.has(plateClean)) {
                matchedOdoEnd = odoEndByPlate.get(plateClean);
            }

            // If GPS returned a valid odometer reading and it advanced beyond current stored odometer
            if (matchedOdoEnd && matchedOdoEnd > latestOdometer) {
                latestOdometer = Math.round(matchedOdoEnd);
                vehicle.basicDetails.odometer = latestOdometer;
                vehicle.basicDetails.odometerReadingDate = new Date();
                await Vehicle.findByIdAndUpdate(vehicle._id, {
                    $set: {
                        "basicDetails.odometer": latestOdometer,
                        "basicDetails.odometerReadingDate": new Date()
                    }
                });
            }

            // 4. Maintenance Tracking Check
            const vThreshold = (vehicle.maintenanceDetails?.maintenanceThresholdKm && Number(vehicle.maintenanceDetails.maintenanceThresholdKm) > 0)
                ? Number(vehicle.maintenanceDetails.maintenanceThresholdKm)
                : thresholdKm;
            const lastServiceOdo = Number(vehicle.maintenanceDetails?.lastMaintenanceOdometer || 0);
            const distanceSinceService = Math.max(0, latestOdometer - lastServiceOdo);
            const warningDistance = vThreshold * warningPercent;

            const vehicleSummary = {
                vehicleId: vehicle._id,
                plate: vehicle.legalDocs?.registrationNumber || vehicle.basicDetails?.plateNumber || vehicle.basicDetails?.fleetNumber || "N/A",
                makeModel: `${vehicle.basicDetails?.make || ''} ${vehicle.basicDetails?.model || ''}`.trim(),
                currentOdometer: latestOdometer,
                lastServiceOdometer: lastServiceOdo,
                thresholdKm: vThreshold,
                distanceSinceService,
            };

            if (distanceSinceService >= vThreshold) {
                criticalList.push(vehicleSummary);
            } else if (distanceSinceService >= warningDistance) {
                dueList.push(vehicleSummary);
            } else {
                okList.push(vehicleSummary);
            }

            // 5. Create or resolve alerts
            await checkAndCreateMaintenanceAlert(vehicle, defaultSettings);
        }

        console.log(`[MIDNIGHT-CRON] Sync Completed:`);
        console.log(` - Critical Vehicles (Overdue Service): ${criticalList.length}`);
        console.log(` - Due Vehicles (Approaching Service): ${dueList.length}`);
        console.log(` - Good / OK Vehicles: ${okList.length}`);

        return {
            success: true,
            totalVehicles: vehicles.length,
            criticalCount: criticalList.length,
            dueCount: dueList.length,
            okCount: okList.length,
            criticalList,
            dueList
        };
    } catch (err) {
        console.error("[MIDNIGHT-CRON ERROR] Sync failed:", err);
        return { success: false, message: err.message };
    }
};

module.exports = {
    getSystemMaintenanceSettings,
    checkAndCreateMaintenanceAlert,
    checkAndCreateInsuranceAlert,
    resolveMaintenanceAlerts,
    runPeriodicVehicleChecks,
    runMidnightGpsOdometerAndMaintenanceSync,
};
