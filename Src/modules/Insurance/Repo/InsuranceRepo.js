const Insurance = require("../Model/InsuranceModel");

/**
 * Creates a new Insurance record.
 * @param {Object} data
 * @returns {Promise<Object>}
 */
exports.createInsuranceService = async (data) => {
    try {
        const newInsurance = await Insurance.create(data);
        return newInsurance.toObject();
    } catch (error) {
        if (error.code === 11000 && error.keyPattern && error.keyPattern['policyNumber']) {
            throw new Error("An insurance policy with this policy number already exists.", { cause: 409 });
        }
        throw error;
    }
};

/**
 * Retrieves all Insurance records.
 * @param {Object} query - Optional query filters
 * @returns {Promise<Array>}
 */
exports.getAllInsurancesService = async (query = {}) => {
    try {
        return await Insurance.find(query).populate("vehicles");
    } catch (error) {
        throw error;
    }
};

/**
 * Retrieves a single Insurance record by ID.
 * @param {string} id
 * @returns {Promise<Object>}
 */
exports.getInsuranceByIdService = async (id) => {
    try {
        return await Insurance.findById(id).populate("vehicles");
    } catch (error) {
        throw error;
    }
};

/**
 * Updates an Insurance record safely.
 * @param {string} id
 * @param {Object} updateData
 * @returns {Promise<Object>}
 */
exports.updateInsuranceService = async (id, updateData) => {
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

        const flattenForSet = (obj, parentKey = '') => {
            let result = {};
            for (const key in obj) {
                if (!obj.hasOwnProperty(key)) continue;

                const val = obj[key];
                const newKey = parentKey ? `${parentKey}.${key}` : key;

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

        const flatSet = flattenForSet(regularFields);

        const finalUpdate = { ...operators };
        if (Object.keys(flatSet).length > 0) {
            finalUpdate.$set = { ...(finalUpdate.$set || {}), ...flatSet };
        }

        return await Insurance.findByIdAndUpdate(id, finalUpdate, { new: true, runValidators: true });
    } catch (error) {
        throw error;
    }
};

/**
 * Deletes an Insurance record.
 * @param {string} id
 * @returns {Promise<Object>}
 */
exports.deleteInsuranceService = async (id) => {
    try {
        return await Insurance.findByIdAndDelete(id);
    } catch (error) {
        throw error;
    }
};
