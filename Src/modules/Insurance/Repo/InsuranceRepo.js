const Insurance = require("../Model/InsuranceModel");
const Supplier = require("../../Supplier/Model/SupplierModel");


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
        throw error;
    }
};

const { applyQueryFeatures } = require("../../../shared/utils/queryHelper");

/**
 * Retrieves all insurance records using generic query features.
 * @param {Object} queryParams - Raw query parameters from req.query.
 * @param {Object} [options={}] - Additional options like baseQuery.
 * @returns {Promise<Object>} Paginated result
 */
exports.getAllInsurancesService = async (queryParams = {}, options = {}) => {
    try {
        let baseQuery = options.baseQuery ? { ...options.baseQuery } : {};

        // Prevent client query params from overriding country restriction
        if (baseQuery.country) {
            delete queryParams.country;
        }

        // Handle search (by policyNumber or supplier name)
        if (queryParams.search) {
            const searchTerm = queryParams.search.trim();
            if (searchTerm) {
                // Find matching suppliers
                const matchingSuppliers = await Supplier.find({
                    name: { $regex: searchTerm, $options: "i" },
                    isDeleted: false
                }).select("_id");

                const supplierIds = matchingSuppliers.map(s => s._id);

                const searchConditions = [
                    { policyNumber: { $regex: searchTerm, $options: "i" } }
                ];

                if (supplierIds.length > 0) {
                    searchConditions.push({ supplier: { $in: supplierIds } });
                }

                if (baseQuery.$and) {
                    baseQuery.$and.push({ $or: searchConditions });
                } else if (baseQuery.$or) {
                    baseQuery = { $and: [baseQuery, { $or: searchConditions }] };
                } else {
                    baseQuery.$or = searchConditions;
                }
            }
            // Delete search query parameter so generic applyQueryFeatures doesn't process it on searchFields again
            delete queryParams.search;
        }

        const queryOptions = {
            searchFields: [],
            filterFields: ["status", "policyType", "coverageType", "country"],
            dateFilterField: "createdAt",
            populate: [
                { path: "supplier", select: "name email phone" }
            ],
            ...options,
            baseQuery
        };

        return await applyQueryFeatures(Insurance, queryParams, queryOptions);
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
        return await Insurance.findById(id);
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

        return await Insurance.findByIdAndUpdate(id, finalUpdate, { returnDocument: "after", runValidators: true });
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
