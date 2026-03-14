const {
    createInsuranceService,
    getAllInsurancesService,
    getInsuranceByIdService,
    updateInsuranceService,
    deleteInsuranceService
} = require("../Repo/InsuranceRepo");
const uploadToS3 = require("../../../utils/uploadToS3"); 

/**
 * Create a new Insurance
 * @route POST /api/insurance/
 * @access Private
 */
const createInsurance = async (req, res) => {
    try {
        let insuranceData = req.body;
        insuranceData.createdBy = req.user.id;
        insuranceData.createdByModel = req.user.role; 

        const newInsurance = await createInsuranceService(insuranceData);
        return res.status(201).json({ success: true, data: newInsurance });
    } catch (error) {
        return res.status(error.cause || 500).json({ success: false, message: error.message });
    }
};

/**
 * Get all Insurances
 * @route GET /api/insurance/
 * @access Private
 */
const getAllInsurances = async (req, res) => {
    try {
        const insurances = await getAllInsurancesService();
        return res.status(200).json({ success: true, data: insurances });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Get eligible Insurances for vehicle onboarding
 * @route GET /api/insurance/eligible
 * @access Private
 */
const getEligibleInsurances = async (req, res) => {
    try {
        // Only return ACTIVE insurances. Might also want to filter by Fleet/Individual or coverage later.
        const insurances = await getAllInsurancesService({ status: "ACTIVE" });
        return res.status(200).json({ success: true, data: insurances });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Get a single Insurance
 * @route GET /api/insurance/:id
 * @access Private
 */
const getInsuranceById = async (req, res) => {
    try {
        const insurance = await getInsuranceByIdService(req.params.id);
        if (!insurance) return res.status(404).json({ success: false, message: "Insurance not found" });
        return res.status(200).json({ success: true, data: insurance });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Update an Insurance
 * @route PUT /api/insurance/:id
 * @access Private
 */
const updateInsurance = async (req, res) => {
    try {
        const updatedInsurance = await updateInsuranceService(req.params.id, req.body);
        if (!updatedInsurance) return res.status(404).json({ success: false, message: "Insurance not found" });
        return res.status(200).json({ success: true, data: updatedInsurance });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Delete an Insurance
 * @route DELETE /api/insurance/:id
 * @access Private
 */
const deleteInsurance = async (req, res) => {
    try {
        const deletedInsurance = await deleteInsuranceService(req.params.id);
        if (!deletedInsurance) return res.status(404).json({ success: false, message: "Insurance not found" });
        return res.status(200).json({ success: true, message: "Insurance deleted successfully" });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Upload Insurance Document to AWS S3.
 * @route POST /api/insurance/:id/upload-document
 * @access Private
 */
const uploadInsuranceDocument = async (req, res) => {
    try {
        const insuranceId = req.params.id;

        const insurance = await getInsuranceByIdService(insuranceId);
        if (!insurance) {
            return res.status(404).json({ success: false, message: "Insurance not found" });
        }

        const file = req.file;
        if (!file) {
            return res.status(400).json({ success: false, message: "No document uploaded" });
        }

        const key = `insurances/${insuranceId}/documents/policy_${Date.now()}_${file.originalname.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
        const uploadedKey = await uploadToS3(file, key);

        await updateInsuranceService(insuranceId, { "documents.policyDocumentUrl": uploadedKey });

        return res.status(200).json({
            success: true,
            message: "Document uploaded successfully.",
            data: { policyDocumentUrl: uploadedKey }
        });

    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = {
    createInsurance,
    getAllInsurances,
    getEligibleInsurances,
    getInsuranceById,
    updateInsurance,
    deleteInsurance,
    uploadInsuranceDocument
};
