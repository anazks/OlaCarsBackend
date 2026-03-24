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

const { applyQueryFeatures } = require("../../../shared/utils/queryHelper");

/**
 * Retrieves all vehicles using generic query features.
 * @param {Object} queryParams - Raw query parameters from req.query.
 * @param {Object} [options={}] - Additional options like baseQuery.
 * @returns {Promise<Object>} Paginated result
 */
exports.getVehiclesService = async (queryParams = {}, options = {}) => {
    try {
        const queryOptions = {
            searchFields: [
                "basicDetails.make", 
                "basicDetails.model", 
                "basicDetails.vin", 
                "legalDocs.registrationNumber"
            ],
            filterFields: [
                "status", 
                "purchaseDetails.branch", 
                "basicDetails.category", 
                "basicDetails.fuelType"
            ],
            dateFilterField: "createdAt",
            populate: [
                { path: "purchaseDetails.branch" },
                { path: "purchaseDetails.purchaseOrder" }
            ],
            ...options
        };

        return await applyQueryFeatures(Vehicle, queryParams, queryOptions);
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
 * Helper to recursively flatten an object into dot-notation for MongoDB $set.
 * Prevents full sub-document overwrites when making partial updates.
 */
const flattenForSet = (obj, parentKey = '') => {
    let result = {};
    for (const key in obj) {
        if (!obj.hasOwnProperty(key)) continue;

        const val = obj[key];
        const newKey = parentKey ? `${parentKey}.${key}` : key;

        // Don't flatten arrays, nulls, Dates, or MongoDB ObjectIds
        if (
            val !== null &&
            typeof val === 'object' &&
            !Array.isArray(val) &&
            !(val instanceof Date) &&
            !val._bsontype
        ) {
            Object.assign(result, flattenForSet(val, newKey));
        } else {
            result[newKey] = val;
        }
    }
    return result;
};

/**
 * Updates a Vehicle record safely.
 * @param {string} id - Vehicle ID
 * @param {Object} updateData - Data to update (supports nested objects and $push/$pull)
 * @param {Object} [session] - Optional MongoDB session for transactions
 * @returns {Promise<Object>}
 */
exports.updateVehicleService = async (id, updateData, session = null) => {
    try {
        const operators = {};
        const regularFields = {};

        // Separate MongoDB operators from regular fields
        for (const key in updateData) {
            if (key.startsWith('$')) {
                operators[key] = updateData[key];
            } else {
                regularFields[key] = updateData[key];
            }
        }

        // Flatten regular fields to prevent sub-document overwriting
        const flatSet = flattenForSet(regularFields);

        // Build the final query
        const finalUpdate = { ...operators };
        if (Object.keys(flatSet).length > 0) {
            finalUpdate.$set = { ...(finalUpdate.$set || {}), ...flatSet };
        }

        const options = { returnDocument: "after", runValidators: true };
        if (session) options.session = session;

        return await Vehicle.findByIdAndUpdate(id, finalUpdate, options);
    } catch (error) {
        throw error;
    }
};
