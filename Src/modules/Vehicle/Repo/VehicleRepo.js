const { Vehicle, VEHICLE_STATUSES } = require("../Model/VehicleModel");

/**
 * Creates a new Vehicle record in the PENDING ENTRY state.
 * @param {Object} data
 * @returns {Promise<Object>}
 */
exports.addVehicleService = async (data) => {
    try {
        const newVehicle = await Vehicle.create(data);
        return newVehicle.toObject();
    } catch (error) {
        if (error.code === 11000 && error.keyPattern && error.keyPattern['basicDetails.vin']) {
            throw new Error("A vehicle with this VIN already exists.", { cause: 409 });
        }
        throw error;
    }
};

/**
 * Retrieves all Vehicles.
 * @param {Object} query - Optional query filters
 * @returns {Promise<Array>}
 */
exports.getVehiclesService = async (query = {}) => {
    try {
        return await Vehicle.find(query).populate("purchaseDetails.branch").populate("purchaseDetails.purchaseOrder");
    } catch (error) {
        throw error;
    }
};

/**
 * Retrieves a single Vehicle by ID.
 * @param {string} id
 * @returns {Promise<Object>}
 */
exports.getVehicleByIdService = async (id) => {
    try {
        return await Vehicle.findById(id).populate("purchaseDetails.branch").populate("purchaseDetails.purchaseOrder");
    } catch (error) {
        throw error;
    }
};

/**
 * Updates a Vehicle record. Typically used for progressing through the onboarding states.
 * @param {string} id - Vehicle ID
 * @param {Object} updateData - Data to update
 * @returns {Promise<Object>}
 */
exports.updateVehicleService = async (id, updateData) => {
    try {
        return await Vehicle.findByIdAndUpdate(id, updateData, { new: true, runValidators: true });
    } catch (error) {
        throw error;
    }
};
