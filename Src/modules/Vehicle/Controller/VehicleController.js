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

        // Handle the new insurance flow
        if (req.body.insuranceId) {
            vehicleData.insurance = req.body.insuranceId;
        }

        const branchRoles = [
            "BRANCHMANAGER",
            "OPERATIONSTAFF",
            "FINANCESTAFF",
            "WORKSHOPSTAFF"
        ];

        // If created by branch manager or roles under him, branch ID comes from token
        if (branchRoles.includes(req.user.role) && req.user.branchId) {
            if (!vehicleData.purchaseDetails) {
                vehicleData.purchaseDetails = {};
            }
            vehicleData.purchaseDetails.branch = req.user.branchId;
        }

        const newVehicle = await addVehicleService(vehicleData);

        // If a Purchase Order is linked, mark it as used
        if (newVehicle.purchaseDetails && newVehicle.purchaseDetails.purchaseOrder) {
            const { updatePurchaseOrderService } = require("../../PurchaseOrder/Repo/PurchaseOrderRepo");
            await updatePurchaseOrderService(newVehicle.purchaseDetails.purchaseOrder, { isUsed: true });
        }

        // If insurance is provided, add this vehicle to the insurance policy
        if (req.body.insuranceId) {
            const { updateInsuranceService } = require("../../Insurance/Repo/InsuranceRepo");
            await updateInsuranceService(req.body.insuranceId, {
                $push: { vehicles: newVehicle._id }
            });
        }

        return res.status(201).json({ success: true, data: newVehicle });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Get all Vehiclesf
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
 * Automatically updates the Vehicle database record with the new S3 keys.
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

        // Mapping frontend field names to DB dot-notation paths
        const S3_FIELD_MAP = {
            exteriorPhotos: "inspection.exteriorPhotos",
            interiorPhotos: "inspection.interiorPhotos",
            odometerPhoto: "inspection.odometerPhoto",
            registrationDocument: "legalDocs.registrationDocument",
            roadTaxDocument: "legalDocs.roadTaxDisc", // Actually roadTaxDisc in schema
            roadworthinessCertificate: "legalDocs.roadworthinessCertificate",
            // insuranceDocument: "insurancePolicy.policyDocument", // Removed as handled in Insurance module
            importDeclaration: "importationDetails.customsDeclarationNumber", // Assuming they meant document
            customsReceipt: "importationDetails.customsReceipt",
            gatePass: "importationDetails.gatePass",
            purchaseReceipt: "purchaseDetails.purchaseReceipt"
        };

        const uploadedKeys = {};
        const dbUpdatePayload = {};

        // Loop through all file fields gracefully
        for (const [fieldName, fileArray] of Object.entries(files)) {
            if (!fileArray || fileArray.length === 0) continue;

            const dbPath = S3_FIELD_MAP[fieldName];

            if (fieldName === "exteriorPhotos" || fieldName === "interiorPhotos") {
                uploadedKeys[fieldName] = [];
                for (const file of fileArray) {
                    const key = `vehicles/${vehicleId}/documents/${fieldName}_${Date.now()}_${file.originalname.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
                    const uploadedKey = await uploadToS3(file, key);
                    uploadedKeys[fieldName].push(uploadedKey);
                }
                if (dbPath) {
                    dbUpdatePayload.$push = dbUpdatePayload.$push || {};
                    dbUpdatePayload.$push[dbPath] = { $each: uploadedKeys[fieldName] };
                }
            } else {
                // For all single file uploads
                const file = fileArray[0];
                const key = `vehicles/${vehicleId}/documents/${fieldName}_${Date.now()}_${file.originalname.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
                const uploadedKey = await uploadToS3(file, key);
                uploadedKeys[fieldName] = uploadedKey;

                if (dbPath) {
                    dbUpdatePayload[dbPath] = uploadedKey;
                }
            }
        }

        // Auto-update DB if mapping exists
        if (Object.keys(dbUpdatePayload).length > 0) {
            const { updateVehicleService } = require("../Repo/VehicleRepo");
            await updateVehicleService(vehicleId, dbUpdatePayload);
        }

        return res.status(200).json({
            success: true,
            message: "Documents uploaded and vehicle record mapped successfully.",
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
