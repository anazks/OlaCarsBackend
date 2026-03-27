const {
    createInsuranceService,
    getAllInsurancesService,
    getInsuranceByIdService,
    updateInsuranceService,
    deleteInsuranceService
} = require("../Repo/InsuranceRepo");
const uploadToS3 = require("../../../utils/uploadToS3"); 
const CountryManager = require("../../CountryManager/Model/CountryManagerModel");
const Branch = require("../../Branch/Model/BranchModel");
const Supplier = require("../../Supplier/Model/SupplierModel");
const { ROLES } = require("../../../shared/constants/roles");

/**
 * Helper to get the user's country based on their role
 */
const getUserCountry = async (user) => {
    if (user.role === ROLES.COUNTRYMANAGER) {
        const cm = await CountryManager.findById(user.id);
        return cm ? cm.country : null;
    } else if ([ROLES.BRANCHMANAGER, ROLES.FINANCESTAFF, ROLES.OPERATIONSTAFF, ROLES.WORKSHOPSTAFF].includes(user.role)) {
        // user.branchId should be available from auth token payload
        if (!user.branchId) return null;
        const branch = await Branch.findById(user.branchId);
        return branch ? branch.country : null;
    }
    return null;
};

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

        // Assign country dynamically based on requester
        const userCountry = await getUserCountry(req.user);
        if (!userCountry) {
            return res.status(400).json({ success: false, message: "Could not determine the country for this user." });
        }
        insuranceData.country = userCountry;
        
        // If supplier is provided but provider name is missing, auto-fill from supplier
        if (insuranceData.supplier && !insuranceData.provider) {
            const supplierDoc = await Supplier.findById(insuranceData.supplier);
            if (supplierDoc) {
                insuranceData.provider = supplierDoc.name;
            }
        }

        // Create the insurance record first to get its ID for the S3 key
        const newInsurance = await createInsuranceService(insuranceData);

        // If a file was uploaded, upload to S3 and update the record
        if (req.file) {
            const file = req.file;
            const key = `insurances/${newInsurance._id}/documents/policy_${Date.now()}_${file.originalname.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
            const uploadedKey = await uploadToS3(file, key);

            // Update the document URL in the database
            const { updateInsuranceService } = require("../Repo/InsuranceRepo");
            const updatedInsurance = await updateInsuranceService(newInsurance._id, { "documents.policyDocumentUrl": uploadedKey });
            return res.status(201).json({ success: true, data: updatedInsurance });
        }

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
        const queryParams = { ...req.query };
        const options = { defaultSort: { createdAt: -1 } };
        const globalRoles = [ROLES.ADMIN, ROLES.OPERATIONADMIN, ROLES.FINANCEADMIN];

        if (!globalRoles.includes(req.user.role)) {
            const userCountry = await getUserCountry(req.user);
            if (!userCountry) {
                return res.status(403).json({ success: false, message: "Country restriction failed. Country not found." });
            }
            options.baseQuery = { country: userCountry };
        }
        
        // Ensure supplier is populated
        options.populate = [{ path: "supplier", select: "name email phone" }];

        const result = await getAllInsurancesService(queryParams, options);
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
 * Get eligible Insurances for vehicle onboarding
 * @route GET /api/insurance/eligible
 * @access Private
 */
const getEligibleInsurances = async (req, res) => {
    try {
        const queryParams = { ...req.query };
        const options = { 
            baseQuery: { status: "ACTIVE" },
            defaultSort: { createdAt: -1 }
        };
        const globalRoles = [ROLES.ADMIN, ROLES.OPERATIONADMIN, ROLES.FINANCEADMIN];

        if (!globalRoles.includes(req.user.role)) {
            const userCountry = await getUserCountry(req.user);
            if (!userCountry) {
                return res.status(403).json({ success: false, message: "Country restriction failed. Country not found." });
            }
            options.baseQuery.country = userCountry;
        }
        
        // Ensure supplier is populated
        options.populate = [{ path: "supplier", select: "name email phone" }];

        const result = await getAllInsurancesService(queryParams, options);
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
 * Get a single Insurance
 * @route GET /api/insurance/:id
 * @access Private
 */
const getInsuranceById = async (req, res) => {
    try {
        const insurance = await getInsuranceByIdService(req.params.id);
        if (!insurance) return res.status(404).json({ success: false, message: "Insurance not found" });
        // Populate supplier if exists (using service already would have populated if repo handles it, but let's be explicit if repo doesn't)
        if (insurance.populate) await insurance.populate("supplier", "name email phone");
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
