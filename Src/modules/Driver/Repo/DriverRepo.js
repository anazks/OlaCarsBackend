const mongoose = require("mongoose");
const { Driver } = require("../Model/DriverModel");
require("../../Branch/Model/BranchModel");
require("../../Vehicle/Model/VehicleModel");

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

    const result = await Driver.findByIdAndUpdate(id, updateOps, options);

    // If personalInfo.fullName was updated, sync with the connected Customer document
    const newFullName = flatFields["personalInfo.fullName"] || (updateOps.$set && updateOps.$set["personalInfo.fullName"]);
    if (newFullName && result) {
        try {
            const Customer = require("../../Customer/Model/CustomerModel");
            const trimmedName = String(newFullName).trim();
            const syncResult = await Customer.updateMany(
                { driver: result._id, isDeleted: false },
                { $set: { name: trimmedName } },
                session ? { session } : {}
            );
            if (syncResult.matchedCount === 0 && result.personalInfo?.email) {
                await Customer.updateMany(
                    { email: result.personalInfo.email.toLowerCase(), isDeleted: false },
                    { $set: { name: trimmedName, driver: result._id } },
                    session ? { session } : {}
                );
            }
        } catch (syncErr) {
            console.error(`[updateDriverService] Failed to sync name to Customer for Driver ${id}:`, syncErr);
        }
    }

    return result;
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
            searchFields: ["personalInfo.fullName", "personalInfo.email", "driverId", "drivingLicense.licenseNumber", "status"],
            filterFields: ["status", "branch", "currentVehicle"],
            dateFilterField: "createdAt",
            populate: { path: "branch", select: "name code city state country" },
            ...options
        };

        // Handle large fields and sensitivity if not explicitly provided in select
        if (!options.select) {
            let selectFields = "-rentTracking -additionalPayments";
            if (!options.includeSensitive) {
                selectFields += ` ${SENSITIVE_FIELDS}`;
            }
            queryOptions.select = selectFields;
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
    let q = Driver.findOne({ _id: id, isDeleted: false })
        .populate("branch", "name code city state country")
        .populate("currentVehicle")
        .populate({
            path: "assignmentHistory.vehicle",
            select: "basicDetails registrationNumber vin licensePlate vehicleId status"
        })
        .populate({
            path: "rentTracking.vehicle",
            select: "basicDetails registrationNumber vin licensePlate vehicleId status"
        });

    if (!options.includeSensitive) {
        q = q.select(SENSITIVE_FIELDS);
    }

    const driver = await q;
    if (driver && driver.rentTracking && driver.rentTracking.length > 0) {
        const defaultVeh = driver.currentVehicle;
        const assignments = Array.isArray(driver.assignmentHistory) ? driver.assignmentHistory : [];

        driver.rentTracking.forEach(item => {
            if (!item.vehicle && defaultVeh) {
                item.vehicle = defaultVeh;
            }
            // Auto-link missing assignmentId if assignments exist in history
            if (!item.assignmentId && assignments.length > 0) {
                const itemVehId = item.vehicle ? String(item.vehicle._id || item.vehicle) : null;
                const matchingAss = assignments.filter(a => {
                    if (!itemVehId) return true;
                    const aVehId = a.vehicle ? String(a.vehicle._id || a.vehicle) : null;
                    return aVehId === itemVehId;
                });

                if (matchingAss.length === 1) {
                    item.assignmentId = matchingAss[0]._id;
                } else if (matchingAss.length > 1) {
                    if (item.status === 'CANCELLED') {
                        const cancelledAss = matchingAss.find(a => a.status === 'CANCELLED' || a.status === 'COMPLETED');
                        if (cancelledAss) item.assignmentId = cancelledAss._id;
                    } else if (item.dueDate) {
                        const itemTime = new Date(item.dueDate).getTime();
                        for (const a of matchingAss) {
                            const sTime = a.startDate ? new Date(a.startDate).getTime() : 0;
                            const eTime = a.endDate ? new Date(a.endDate).getTime() : Infinity;
                            if (itemTime >= sTime && itemTime <= eTime) {
                                item.assignmentId = a._id;
                                break;
                            }
                        }
                    }
                    if (!item.assignmentId) {
                        const activeAss = matchingAss.find(a => a.status === 'ACTIVE');
                        if (activeAss && item.status !== 'CANCELLED') {
                            item.assignmentId = activeAss._id;
                        }
                    }
                }
            }

            // If the item belongs to a CANCELLED assignment and was never paid, ensure status is CANCELLED
            if (item.assignmentId) {
                const assignedHistory = assignments.find(a => String(a._id) === String(item.assignmentId));
                if (assignedHistory && assignedHistory.status === 'CANCELLED' && item.status === 'PENDING') {
                    item.status = 'CANCELLED';
                    item.balance = 0;
                }
            }
        });
    }

    if (driver) {
        try {
            const Customer = require("../../Customer/Model/CustomerModel");
            const customer = await Customer.findOne({ driver: driver._id, isDeleted: false })
                .select("_id customerId name email phone status isDriver branch");
            if (customer) {
                const driverObj = typeof driver.toObject === 'function' ? driver.toObject() : driver;
                driverObj.customer = customer;
                return driverObj;
            }
        } catch (custErr) {
            console.error("[getDriverByIdService] Error attaching customer:", custErr);
        }
    }

    return driver;
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

