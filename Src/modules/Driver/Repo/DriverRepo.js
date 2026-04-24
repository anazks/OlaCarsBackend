const mongoose = require("mongoose");
const { Driver } = require("../Model/DriverModel");

// ─── Sensitive fields hidden from non-finance roles ───────────────────
const SENSITIVE_FIELDS = "-bankDetails -creditCheck.reportS3Key";

/**
 * Flattens nested objects into dot-notation for $set.
 * e.g. { personalInfo: { fullName: "X" } } → { "personalInfo.fullName": "X" }
 * This prevents Mongo from overwriting the entire nested object.
 */
function flattenForSet(obj, prefix = "") {
    const result = {};
    for (const [key, value] of Object.entries(obj)) {
        const path = prefix ? `${prefix}.${key}` : key;

        // Skip Mongo operators — they go at top level
        if (key.startsWith("$")) {
            result[key] = value;
            continue;
        }

        if (
            value !== null &&
            value !== undefined &&
            typeof value === "object" &&
            !Array.isArray(value) &&
            !(value instanceof Date) &&
            !(value instanceof mongoose.Types.ObjectId)
        ) {
            Object.assign(result, flattenForSet(value, path));
        } else {
            result[path] = value;
        }
    }
    return result;
}

/**
 * Creates a new driver record.
 */
exports.addDriverService = async (data) => {
    const driver = await Driver.create(data);
    return driver;
};

/**
 * Updates a driver using $set (dot-notation) to prevent nested field overwrites.
 * Supports optional MongoDB session for transactions.
 * @param {string} id - Driver mongo ID.
 * @param {Object} updateData - Fields to update (can be nested).
 * @param {Object} [session] - Optional Mongoose session for transactions.
 */
exports.updateDriverService = async (id, updateData, session = null) => {
    // Separate operators from flat fields
    const operators = {};
    const data = {};

    for (const [key, value] of Object.entries(updateData)) {
        if (key.startsWith("$")) {
            operators[key] = value;
        } else {
            data[key] = value;
        }
    }

    const flatFields = flattenForSet(data);
    const updateOps = { ...operators };

    if (Object.keys(flatFields).length > 0) {
        updateOps.$set = { ...(updateOps.$set || {}), ...flatFields };
    }

    const options = { returnDocument: "after", runValidators: true };
    if (session) options.session = session;

    return await Driver.findByIdAndUpdate(id, updateOps, options);
};

/**
 * Soft-deletes a driver.
 */
exports.deleteDriverService = async (id) => {
    await Driver.findByIdAndUpdate(id, { isDeleted: true });
};

const { applyQueryFeatures } = require("../../../shared/utils/queryHelper");

/**
 * Retrieves all drivers using generic query features.
 * @param {Object} queryParams - Raw query parameters from req.query.
 * @param {Object} [options={}] - includeSensitive, baseQuery, etc.
 * @returns {Promise<Object>} Paginated result
 */
exports.getDriversService = async (queryParams = {}, options = {}) => {
    try {
        // Enforce latest first sorting by default if not provided
        if (!queryParams.sortBy) {
            queryParams.sortBy = 'createdAt';
            queryParams.sortOrder = 'desc';
        }

        const queryOptions = {
            searchFields: ["personalInfo.fullName", "personalInfo.email"],
            filterFields: ["status", "branch"],
            dateFilterField: "createdAt",
            populate: { path: "branch", select: "name code city state country" },
            ...options
        };

        // Handle sensitivity if not explicitly provided in select
        if (!options.select && !options.includeSensitive) {
            queryOptions.select = SENSITIVE_FIELDS;
        }

        return await applyQueryFeatures(Driver, queryParams, queryOptions);
    } catch (error) {
        throw error;
    }
};

/**
 * Retrieves a single driver by ID.
 * @param {string} id - Driver mongo ID.
 * @param {Object} options - { includeSensitive: false } to strip finance-only fields.
 */
exports.getDriverByIdService = async (id, options = {}) => {
    let q = Driver.findOne({ _id: id, isDeleted: false }).populate("branch", "name code city state country");

    if (!options.includeSensitive) {
        q = q.select(SENSITIVE_FIELDS);
    }

    return await q;
};

/**
 * Retrieves a single driver by Email.
 * @param {string} email - Driver email.
 * @param {Object} options - { includeSensitive: false }
 */
exports.getDriverByEmailService = async (email, options = {}) => {
    let q = Driver.findOne({ "personalInfo.email": email, isDeleted: false })
        .populate("branch", "name code city state country")
        .populate("currentVehicle");

    if (!options.includeSensitive) {
        q = q.select(SENSITIVE_FIELDS);
    }

    return await q;
};

