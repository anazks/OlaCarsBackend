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
    // Separate $push and other operators from flat fields
    const { $push, $unset, ...rest } = updateData;
    const flatFields = flattenForSet(rest);

    const updateOps = {};
    if (Object.keys(flatFields).length > 0) updateOps.$set = flatFields;
    if ($push) updateOps.$push = $push;
    if ($unset) updateOps.$unset = $unset;

    const options = { new: true, runValidators: true };
    if (session) options.session = session;

    return await Driver.findByIdAndUpdate(id, updateOps, options);
};

/**
 * Soft-deletes a driver.
 */
exports.deleteDriverService = async (id) => {
    await Driver.findByIdAndUpdate(id, { isDeleted: true });
};

/**
 * Retrieves all non-deleted drivers with optional filters.
 * @param {Object} filter - Optional filter (status, branch, etc.)
 * @param {Object} options - { includeSensitive: false } to strip finance-only fields.
 */
exports.getDriversService = async (filter = {}, options = {}) => {
    const query = { isDeleted: false, ...filter };
    let q = Driver.find(query).populate("branch", "branchName location");

    if (!options.includeSensitive) {
        q = q.select(SENSITIVE_FIELDS);
    }

    return await q;
};

/**
 * Retrieves a single driver by ID.
 * @param {string} id - Driver mongo ID.
 * @param {Object} options - { includeSensitive: false } to strip finance-only fields.
 */
exports.getDriverByIdService = async (id, options = {}) => {
    let q = Driver.findOne({ _id: id, isDeleted: false }).populate("branch", "branchName location");

    if (!options.includeSensitive) {
        q = q.select(SENSITIVE_FIELDS);
    }

    return await q;
};
