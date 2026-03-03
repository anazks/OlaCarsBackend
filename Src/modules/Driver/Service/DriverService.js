const {
    addDriverService,
    getDriversService,
    getDriverByIdService,
    updateDriverService,
    deleteDriverService,
} = require("../Repo/DriverRepo");

// ─── Fields that CANNOT be set via the edit endpoint ──────────────────
const BLOCKED_FIELDS = [
    "status", "statusHistory", "creditCheck", "rejection",
    "activation", "suspension", "contract",
];

/**
 * Creates a new driver profile with DRAFT status.
 */
exports.create = async (data) => {
    data.status = "DRAFT";
    data.statusHistory = [{
        status: "DRAFT",
        changedBy: data.createdBy,
        changedByRole: data.creatorRole,
        timestamp: new Date(),
        notes: "Driver application initiated.",
    }];
    return await addDriverService(data);
};

/**
 * Retrieves all drivers with optional filter.
 * @param {Object} filter - status, branch, etc.
 * @param {Object} options - { includeSensitive: bool }
 */
exports.getAll = async (filter = {}, options = {}) => {
    return await getDriversService(filter, options);
};

/**
 * Retrieves a driver by ID.
 * @param {string} id
 * @param {Object} options - { includeSensitive: bool }
 */
exports.getById = async (id, options = {}) => {
    return await getDriverByIdService(id, options);
};

/**
 * Updates non-workflow fields on a driver (e.g. personal info edits).
 * Does NOT change status — use the workflow service for that.
 * Blocks sensitive/workflow fields from being injected.
 */
exports.update = async (id, data) => {
    // Strip all workflow-controlled and sensitive fields
    for (const field of BLOCKED_FIELDS) {
        delete data[field];
    }
    return await updateDriverService(id, data);
};

/**
 * Soft-deletes a driver.
 */
exports.remove = async (id) => {
    return await deleteDriverService(id);
};
