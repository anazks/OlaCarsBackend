const {
    addVehicleService,
    getVehiclesService,
    getVehicleByIdService,
} = require("../Repo/VehicleRepo");
const { processVehicleProgress } = require("../Service/VehicleWorkflowService");

/**
 * Create a new Vehicle Outline. (Step 1 & 2)
 * @route POST /api/vehicle/
 * @access Private
 */
const addVehicle = async (req, res) => {
    try {
        let vehicleData = req.body;
        vehicleData.createdBy = req.user.id;
        vehicleData.creatorRole = req.user.role;
        vehicleData.status = "PENDING ENTRY";

        const newVehicle = await addVehicleService(vehicleData);
        return res.status(201).json({ success: true, data: newVehicle });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Get all Vehicles
 * @route GET /api/vehicle/
 * @access Private
 */
const getVehicles = async (req, res) => {
    try {
        const pos = await getVehiclesService();
        return res.status(200).json({ success: true, data: pos });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Get a single Vehicle
 * @route GET /api/vehicle/:id
 * @access Private
 */
const getVehicleById = async (req, res) => {
    try {
        const vehicle = await getVehicleByIdService(req.params.id);
        if (!vehicle) return res.status(404).json({ success: false, message: "Vehicle not found" });
        return res.status(200).json({ success: true, data: vehicle });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Update Vehicle details and progress status through the Onboarding workflow.
 * @route PUT /api/vehicle/:id/progress
 * @access Private
 */
const progressVehicleStatus = async (req, res) => {
    try {
        const vehicleId = req.params.id;
        const { targetStatus, updateData } = req.body;
        const user = req.user;

        const updatedVehicle = await processVehicleProgress(vehicleId, targetStatus, updateData, user);

        return res.status(200).json({ success: true, data: updatedVehicle });
    } catch (error) {
        const statusCode = error.cause || 500;
        return res.status(statusCode).json({ success: false, message: error.message });
    }
};

module.exports = {
    addVehicle,
    getVehicles,
    getVehicleById,
    progressVehicleStatus,
};
