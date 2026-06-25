const FleetService = require('../Service/FleetService');

/**
 * Creates a new fleet document.
 * If fleetNumber is not provided, it auto-generates the next sequential number.
 */
exports.addFleet = async (req, res, next) => {
    try {
        const fleetData = { ...req.body };
        
        // Auto-generate fleet number if not supplied
        if (!fleetData.fleetNumber || fleetData.fleetNumber.trim() === "") {
            fleetData.fleetNumber = await FleetService.generateNextFleetNumber();
        }

        const newFleet = await FleetService.createFleet(fleetData);
        return res.status(201).json({ success: true, data: newFleet });
    } catch (error) {
        const statusCode = error.cause || 500;
        return res.status(statusCode).json({ success: false, message: error.message });
    }
};

/**
 * Gets all fleets, dynamically populating assigned staff and listing vehicles.
 */
exports.getFleets = async (req, res, next) => {
    try {
        const queryParams = { ...req.query };
        const result = await FleetService.getAllFleets(queryParams, {
            baseQuery: { isDeleted: false },
            defaultSort: { createdAt: -1 }
        });

        return res.status(200).json({
            success: true,
            data: result.data,
            pagination: {
                total: result.total,
                page: result.page,
                limit: result.limit,
                totalPages: result.totalPages
            }
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Gets a single fleet by ID.
 */
exports.getFleetById = async (req, res, next) => {
    try {
        const fleet = await FleetService.getFleetById(req.params.id);
        if (!fleet) {
            return res.status(404).json({ success: false, message: 'Fleet not found' });
        }
        return res.status(200).json({ success: true, data: fleet });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Updates a fleet's details and staff assignment.
 */
exports.updateFleet = async (req, res, next) => {
    try {
        const updated = await FleetService.updateFleet(req.params.id, req.body);
        return res.status(200).json({ success: true, data: updated });
    } catch (error) {
        const statusCode = error.cause || 500;
        return res.status(statusCode).json({ success: false, message: error.message });
    }
};

/**
 * Soft deletes a fleet and unlinks all assigned vehicles.
 */
exports.deleteFleet = async (req, res, next) => {
    try {
        const result = await FleetService.deleteFleet(req.params.id);
        return res.status(200).json({ success: true, message: result.message });
    } catch (error) {
        const statusCode = error.cause || 500;
        return res.status(statusCode).json({ success: false, message: error.message });
    }
};

/**
 * GET API to retrieve the next available sequential fleet number.
 */
exports.getNextFleetNumber = async (req, res, next) => {
    try {
        const nextNum = await FleetService.generateNextFleetNumber();
        return res.status(200).json({ success: true, data: { fleetNumber: nextNum } });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};
