const Lease = require("../Model/LeaseModel");

/**
 * Creates a new lease record.
 */
exports.createLeaseService = async (data, session = null) => {
    const options = {};
    if (session) options.session = session;
    const lease = new Lease(data);
    return await lease.save(options);
};

/**
 * Updates a lease record.
 */
exports.updateLeaseService = async (id, updateData, session = null) => {
    const options = { returnDocument: "after", runValidators: true };
    if (session) options.session = session;
    return await Lease.findByIdAndUpdate(id, updateData, options);
};

/**
 * Retrieves a lease by ID.
 */
exports.getLeaseByIdService = async (id) => {
    return await Lease.findById(id).populate("driver vehicle agreementVersion");
};

/**
 * Retrieves the latest active lease for a driver.
 */
exports.getLatestActiveLeaseByDriverService = async (driverId) => {
    return await Lease.findOne({ driver: driverId, status: "ACTIVE" })
        .sort({ createdAt: -1 })
        .populate("vehicle");
};

/**
 * Retrieves all leases for a driver.
 */
exports.getLeasesByDriverService = async (driverId) => {
    return await Lease.find({ driver: driverId }).sort({ createdAt: -1 }).populate("vehicle");
};
