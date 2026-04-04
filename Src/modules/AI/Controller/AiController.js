const { Vehicle } = require("../../Vehicle/Model/VehicleModel");
const { Driver } = require("../../Driver/Model/DriverModel");
const PreBooking = require("../Model/PreBookingModel");
const mongoose = require("mongoose");
const AppError = require("../../../shared/utils/AppError");

/**
 * Fetches all vehicles that are currently available for booking.
 */
exports.getAvailableVehicles = async (req, res, next) => {
    try {
        const vehicles = await Vehicle.find({ status: "ACTIVE — AVAILABLE", isDeleted: false })
            .select("basicDetails.make basicDetails.model basicDetails.year basicDetails.category basicDetails.fuelType basicDetails.transmission basicDetails.colour basicDetails.seats basicDetails.monthlyRent purchaseDetails.branch")
            .populate("purchaseDetails.branch", "name city");

        res.status(200).json({
            success: true,
            count: vehicles.length,
            data: vehicles,
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Creates a pre-booking for a vehicle using a driver's phone number.
 * If the driver doesn't exist, a DRAFT profile is created.
 */
exports.bookVehicle = async (req, res, next) => {
    const session = await mongoose.startSession();
    try {
        session.startTransaction();

        const { phone, vehicleId } = req.body;

        if (!phone || !vehicleId) {
            throw new AppError("Phone number and vehicle ID are required.", 400);
        }

        // 1. Check Vehicle Availability
        const vehicle = await Vehicle.findOne({ _id: vehicleId, status: "ACTIVE — AVAILABLE", isDeleted: false }).session(session);
        if (!vehicle) {
            throw new AppError("Vehicle is not available or does not exist.", 404);
        }

        // 2. Find or Create DRAFT Driver
        let driver = await Driver.findOne({ "personalInfo.phone": phone, isDeleted: false }).session(session);
        
        if (!driver) {
            // Create a DRAFT driver
            // Note: fullName is typically required, using a placeholder
            driver = new Driver({
                status: "DRAFT",
                personalInfo: {
                    fullName: `AI Pre-booked (Phone: ${phone})`,
                    phone: phone,
                },
                branch: vehicle.purchaseDetails.branch, // Default to vehicle's branch
                createdBy: new mongoose.Types.ObjectId(), // Placeholder for system-created
                creatorRole: "ADMIN", // Defaulting to admin role for internal creation
            });
            await driver.save({ session });
        }

        // 3. Update Vehicle Status
        vehicle.status = "PRE-BOOKED";
        vehicle.statusHistory.push({
            status: "PRE-BOOKED",
            notes: `Auto-reserved via AI Call Service for phone: ${phone}`,
            changedBy: driver._id, // Assign to the pre-booked driver
            changedByRole: "DRIVER",
        });
        await vehicle.save({ session });

        // 4. Create PreBooking Record
        const preBooking = new PreBooking({
            vehicle: vehicle._id,
            driver: driver._id,
            phone: phone,
            status: "PENDING",
        });
        await preBooking.save({ session });

        // Commit transaction
        await session.commitTransaction();
        session.endSession();

        res.status(201).json({
            success: true,
            message: "Vehicle pre-booked successfully.",
            data: {
                preBookingId: preBooking._id,
                vehicle: {
                    id: vehicle._id,
                    make: vehicle.basicDetails.make,
                    model: vehicle.basicDetails.model,
                },
                driverId: driver._id,
            },
        });
    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        next(error);
    }
};
