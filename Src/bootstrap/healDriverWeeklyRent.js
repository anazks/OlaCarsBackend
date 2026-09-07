const { Driver } = require("../modules/Driver/Model/DriverModel");
const { Vehicle } = require("../modules/Vehicle/Model/VehicleModel");

/**
 * Self-healing migration to backfill driver.weeklyRent for legacy / migrated drivers
 * who have rent amounts stored in rentTracking or on their assigned vehicle.
 */
const healDriverWeeklyRent = async () => {
    try {
        const drivers = await Driver.find({
            $or: [
                { weeklyRent: { $exists: false } },
                { weeklyRent: null },
                { weeklyRent: 0 }
            ],
            isDeleted: false
        }).populate('currentVehicle');

        let healedCount = 0;

        for (const driver of drivers) {
            let resolvedRent = null;

            // 1. Try to get from first tracking entry with an amount
            if (Array.isArray(driver.rentTracking) && driver.rentTracking.length > 0) {
                const trackItem = driver.rentTracking.find(t => t.amount && Number(t.amount) > 0) || driver.rentTracking[0];
                if (trackItem && trackItem.amount && Number(trackItem.amount) > 0) {
                    resolvedRent = Number(trackItem.amount);
                }
            }

            // 2. Try to get from assigned vehicle's basicDetails.weeklyRent
            if (!resolvedRent && driver.currentVehicle?.basicDetails?.weeklyRent) {
                resolvedRent = Number(driver.currentVehicle.basicDetails.weeklyRent);
            }

            if (resolvedRent && resolvedRent > 0) {
                await Driver.updateOne(
                    { _id: driver._id },
                    { $set: { weeklyRent: resolvedRent } }
                );

                // Also sync to vehicle if vehicle has no weekly rent set
                if (driver.currentVehicle?._id && !driver.currentVehicle.basicDetails?.weeklyRent) {
                    await Vehicle.updateOne(
                        { _id: driver.currentVehicle._id },
                        { $set: { "basicDetails.weeklyRent": resolvedRent } }
                    );
                }

                healedCount++;
            }
        }

        if (healedCount > 0) {
            console.log(`[Self-Healing] Backfilled weeklyRent for ${healedCount} drivers.`);
        }
    } catch (error) {
        console.error("[Self-Healing] healDriverWeeklyRent error:", error.message);
    }
};

module.exports = { healDriverWeeklyRent };
