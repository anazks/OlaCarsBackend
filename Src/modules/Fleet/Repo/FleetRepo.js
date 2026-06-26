const Fleet = require('../Model/FleetModel');
const { Vehicle } = require('../../Vehicle/Model/VehicleModel');
const OperationStaff = require('../../OperationStaff/Model/OperationStaffModel');
const FinanceStaff = require('../../FinanceStaff/Model/FinanceStaffModel');
const { applyQueryFeatures } = require('../../../shared/utils/queryHelper');
const mongoose = require('mongoose');

/**
 * Syncs the fleetNumber string into the staff's flat fleetNumbers array.
 * Reconciles old/new staff assignments to prevent orphans or duplicates.
 */
const syncStaffFleetNumbers = async (fleetNumber, newStaffId, oldStaffId, staffModel, session = null) => {
    try {
        const Staff = staffModel === 'OperationStaff' ? OperationStaff : FinanceStaff;
        const options = session ? { session } : {};
        
        // Remove from old staff if necessary
        if (oldStaffId && oldStaffId.toString() !== newStaffId?.toString()) {
            // Find the old staff (in both models if we don't know the old model)
            await OperationStaff.findByIdAndUpdate(oldStaffId, { $pull: { fleetNumbers: fleetNumber } }, options);
            await FinanceStaff.findByIdAndUpdate(oldStaffId, { $pull: { fleetNumbers: fleetNumber } }, options);
        }

        // Add to new staff
        if (newStaffId) {
            await Staff.findByIdAndUpdate(newStaffId, { $addToSet: { fleetNumbers: fleetNumber } }, options);
        }
    } catch (error) {
        console.error('[SYNC ERROR] Failed to sync staff fleet numbers:', error);
    }
};

/**
 * Creates a new Fleet.
 */
exports.addFleet = async (data) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const newFleet = await Fleet.create([data], { session });
        const fleetObj = newFleet[0];

        // Sync with staff flat array
        await syncStaffFleetNumbers(
            fleetObj.fleetNumber,
            fleetObj.assignedStaff,
            null,
            fleetObj.assignedStaffModel,
            session
        );

        await session.commitTransaction();
        session.endSession();
        return fleetObj.toObject();
    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        if (error.code === 11000) {
            throw new Error(`A fleet with number "${data.fleetNumber}" already exists.`, { cause: 409 });
        }
        throw error;
    }
};

/**
 * Retrieves all fleets with pagination, query filtering, and dynamic vehicle listing.
 */
exports.getFleets = async (queryParams = {}, options = {}) => {
    try {
        const queryOptions = {
            searchFields: ['fleetNumber', 'description'],
            filterFields: ['status', 'assignedStaff', 'assignedStaffModel', 'branchId'],
            dateFilterField: 'createdAt',
            populate: [
                { path: 'assignedStaff', select: 'fullName email phone role branchId' },
                { path: 'branchId', select: 'name code city status type' }
            ],
            ...options
        };

        const results = await applyQueryFeatures(Fleet, queryParams, queryOptions);

        // Fetch vehicle counts and basic info for each fleet
        const fleetsWithVehicles = await Promise.all(results.data.map(async (fleet) => {
            const fleetObj = fleet.toObject ? fleet.toObject() : fleet;
            const vehicles = await Vehicle.find({ fleet: fleetObj._id, isDeleted: false })
                .select('basicDetails status legalDocs.registrationNumber currentDriver')
                .populate('currentDriver', 'personalInfo.fullName driverId');
            
            return {
                ...fleetObj,
                vehicles,
                vehicleCount: vehicles.length
            };
        }));

        return {
            ...results,
            data: fleetsWithVehicles
        };
    } catch (error) {
        throw error;
    }
};

/**
 * Gets a single Fleet by ID with populated staff and dynamic vehicle details.
 */
exports.getFleetById = async (id) => {
    try {
        const fleet = await Fleet.findById(id)
            .populate('assignedStaff', 'fullName email phone role branchId')
            .populate('branchId', 'name code city status type');
        
        if (!fleet) return null;

        const fleetObj = fleet.toObject();
        const vehicles = await Vehicle.find({ fleet: fleetObj._id, isDeleted: false })
            .select('basicDetails status legalDocs.registrationNumber currentDriver')
            .populate('currentDriver', 'personalInfo.fullName driverId');

        return {
            ...fleetObj,
            vehicles,
            vehicleCount: vehicles.length
        };
    } catch (error) {
        throw error;
    }
};

/**
 * Updates a Fleet and synchronizes staff assignments.
 */
exports.updateFleet = async (id, updateData) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const existingFleet = await Fleet.findById(id).session(session);
        if (!existingFleet) {
            throw new Error('Fleet not found', { cause: 404 });
        }

        const oldStaffId = existingFleet.assignedStaff;
        const oldFleetNumber = existingFleet.fleetNumber;

        // Perform the update
        const updatedFleet = await Fleet.findByIdAndUpdate(
            id,
            { $set: updateData },
            { new: true, runValidators: true, session }
        ).populate('assignedStaff', 'fullName email phone role branchId')
         .populate('branchId', 'name code city status type');

        // Sync staff assignments
        await syncStaffFleetNumbers(
            updatedFleet.fleetNumber,
            updatedFleet.assignedStaff,
            oldStaffId,
            updatedFleet.assignedStaffModel,
            session
        );

        // If fleet number changed (rare, but handle it), update it in vehicles and rename in staff
        if (updateData.fleetNumber && updateData.fleetNumber !== oldFleetNumber) {
            await Vehicle.updateMany(
                { fleet: id },
                { $set: { 'basicDetails.fleetNumber': updateData.fleetNumber } },
                { session }
            );

            // Reconcile staff fleetNumber arrays (rename string value)
            if (updatedFleet.assignedStaff) {
                const Staff = updatedFleet.assignedStaffModel === 'OperationStaff' ? OperationStaff : FinanceStaff;
                await Staff.findByIdAndUpdate(updatedFleet.assignedStaff, {
                    $pull: { fleetNumbers: oldFleetNumber }
                }, { session });
                await Staff.findByIdAndUpdate(updatedFleet.assignedStaff, {
                    $addToSet: { fleetNumbers: updatedFleet.fleetNumber }
                }, { session });
            }
        }

        // If assigned staff changed, also sync handlingStaff on all vehicles in this fleet
        if (updateData.assignedStaff && updateData.assignedStaff.toString() !== oldStaffId?.toString()) {
            await Vehicle.updateMany(
                { fleet: id },
                { $set: { handlingStaff: updateData.assignedStaff } },
                { session }
            );
        }

        await session.commitTransaction();
        session.endSession();
        
        // Return full fleet object with vehicles
        return await exports.getFleetById(id);
    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        throw error;
    }
};

/**
 * Soft deletes a Fleet, unlinking all vehicles and removing assignments.
 */
exports.deleteFleet = async (id) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const fleet = await Fleet.findById(id).session(session);
        if (!fleet) {
            throw new Error('Fleet not found', { cause: 404 });
        }

        // Remove fleet association from all vehicles
        await Vehicle.updateMany(
            { fleet: id },
            { $unset: { fleet: 1 }, $set: { 'basicDetails.fleetNumber': '' } },
            { session }
        );

        // Remove fleet assignment from the staff
        if (fleet.assignedStaff) {
            const Staff = fleet.assignedStaffModel === 'OperationStaff' ? OperationStaff : FinanceStaff;
            await Staff.findByIdAndUpdate(fleet.assignedStaff, {
                $pull: { fleetNumbers: fleet.fleetNumber }
            }, { session });
        }

        // Soft delete the fleet
        fleet.isDeleted = true;
        fleet.status = 'INACTIVE';
        await fleet.save({ session });

        await session.commitTransaction();
        session.endSession();
        return { success: true, message: 'Fleet deleted and vehicles unassigned successfully.' };
    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        throw error;
    }
};
