const {
    addVehicleService,
    getVehiclesService,
    getVehicleByIdService,
} = require("../Repo/VehicleRepo");
const { processVehicleProgress } = require("../Service/VehicleWorkflowService");
const uploadToS3 = require("../../../utils/uploadToS3");

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
        const { targetStatus, updateData, notes } = req.body;
        const user = req.user;

        // Merge top-level notes into updateData
        const payload = { ...updateData };
        if (notes) payload.notes = notes;

        const updatedVehicle = await processVehicleProgress(vehicleId, targetStatus, payload, user);

        return res.status(200).json({ success: true, data: updatedVehicle });
    } catch (error) {
        const statusCode = error.cause || 500;
        return res.status(statusCode).json({ success: false, message: error.message });
    }
};

/**
 * Upload Vehicle Documents and Photos to AWS S3.
 * Accepts multiple document fields in formData.
 * @route POST /api/vehicle/:id/upload-documents
 * @access Private
 */
const uploadVehicleDocuments = async (req, res) => {
    try {
        const vehicleId = req.params.id;

        // Ensure vehicle exists
        const vehicle = await getVehicleByIdService(vehicleId);
        if (!vehicle) {
            return res.status(404).json({ success: false, message: "Vehicle not found" });
        }

        const files = req.files;
        if (!files || Object.keys(files).length === 0) {
            return res.status(400).json({ success: false, message: "No documents uploaded" });
        }

        const uploadedKeys = {};

        // Loop through all file fields gracefully
        for (const [fieldName, fileArray] of Object.entries(files)) {
            if (!fileArray || fileArray.length === 0) continue;

            if (fieldName === "exteriorPhotos") {
                uploadedKeys[fieldName] = [];
                for (const file of fileArray) {
                    const key = `vehicles/${vehicleId}/documents/${fieldName}_${Date.now()}_${file.originalname}`;
                    const uploadedKey = await uploadToS3(file, key);
                    uploadedKeys[fieldName].push(uploadedKey);
                }
            } else {
                // For all single file uploads
                const file = fileArray[0];
                const key = `vehicles/${vehicleId}/documents/${fieldName}_${Date.now()}_${file.originalname}`;
                const uploadedKey = await uploadToS3(file, key);
                uploadedKeys[fieldName] = uploadedKey;
            }
        }

        return res.status(200).json({
            success: true,
            message: "Documents uploaded successfully to S3.",
            data: uploadedKeys
        });

    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = {
    addVehicle,
    getVehicles,
    getVehicleById,
    progressVehicleStatus,
    uploadVehicleDocuments
};
