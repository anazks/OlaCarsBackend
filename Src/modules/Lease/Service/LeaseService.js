const LeaseRepo = require("../Repo/LeaseRepo");
const AppError = require("../../../shared/utils/AppError");

/**
 * Creates a new lease for a driver and vehicle.
 */
exports.createLeaseService = async (data, userId, userRole, session = null) => {
    // 1. Mandatory checks
    if (!data.driver || !data.vehicle || !data.durationWeeks || !data.weeklyRent) {
        throw new AppError("Missing required lease details (driver, vehicle, duration, rent)", 400);
    }

    // 2. Prepare lease data
    const leaseData = {
        ...data,
        createdBy: userId,
        creatorRole: userRole,
    };

    // 3. Create the lease record
    const lease = await LeaseRepo.createLeaseService(leaseData, session);

    return lease;
};

/**
 * Retrieves the latest active lease for a driver.
 */
exports.getLatestActiveLeaseByDriverService = async (driverId) => {
    return await LeaseRepo.getLatestActiveLeaseByDriverService(driverId);
};
