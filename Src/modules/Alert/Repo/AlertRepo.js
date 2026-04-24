const { Alert } = require("../Model/AlertModel");

/**
 * Creates a new alert.
 * @param {Object} data 
 * @returns {Promise<Object>}
 */
const createAlertRepo = async (data) => {
    return await Alert.create(data);
};

/**
 * Finds an active alert by vehicle and type.
 * @param {string} vehicleId 
 * @param {string} type 
 * @returns {Promise<Object|null>}
 */
const findActiveAlertRepo = async (vehicleId, type) => {
    return await Alert.findOne({
        vehicleId,
        type,
        status: "ACTIVE",
        isDeleted: false,
    });
};

/**
 * Fetches all active alerts with populated vehicle details.
 * @param {Object} filters 
 * @returns {Promise<Array>}
 */
const getActiveAlertsRepo = async (filters = {}) => {
    const query = { status: "ACTIVE", isDeleted: false, ...filters };
    return await Alert.find(query)
        .populate("vehicleId", "basicDetails purchaseDetails status")
        .sort({ createdAt: -1 });
};

/**
 * Fetches all alerts (active, resolved, dismissed) with populated vehicle details.
 * @param {Object} filters 
 * @returns {Promise<Array>}
 */
const getAllAlertsRepo = async (filters = {}) => {
    const query = { isDeleted: false, ...filters };
    return await Alert.find(query)
        .populate("vehicleId", "basicDetails purchaseDetails status")
        .sort({ createdAt: -1 });
};

/**
 * Resolves an alert.
 * @param {string} alertId 
 * @param {string} userId 
 * @returns {Promise<Object|null>}
 */
const resolveAlertRepo = async (alertId, userId) => {
    return await Alert.findByIdAndUpdate(
        alertId,
        {
            status: "RESOLVED",
            resolvedAt: new Date(),
            resolvedBy: userId,
        },
        { new: true }
    );
};

/**
 * Resolves an alert by vehicle and type.
 * @param {string} vehicleId 
 * @param {string} type 
 * @param {string} userId 
 * @returns {Promise<Object|null>}
 */
const resolveAlertByVehicleAndTypeRepo = async (vehicleId, type, userId) => {
    return await Alert.updateMany(
        { vehicleId, type, status: "ACTIVE" },
        {
            status: "RESOLVED",
            resolvedAt: new Date(),
            resolvedBy: userId,
        }
    );
};

module.exports = {
    createAlertRepo,
    findActiveAlertRepo,
    getActiveAlertsRepo,
    getAllAlertsRepo,
    resolveAlertRepo,
    resolveAlertByVehicleAndTypeRepo,
};
