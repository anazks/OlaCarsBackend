const {
    createInsuranceService,
    getAllInsurancesService,
    getInsuranceByIdService,
    updateInsuranceService,
    deleteInsuranceService
} = require("../Repo/InsuranceRepo");
const uploadToS3 = require("../../../utils/uploadToS3");
const getPresignedUrl = require("../../../utils/getPresignedUrl");
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
        if (!user.branchId) return null;
        const branch = await Branch.findById(user.branchId);
        return branch ? branch.country : null;
    }
    return null;
};

/**
 * Create a new Insurance
 */
const createInsurance = async (req, res) => {
    try {
        let insuranceData = req.body;
        insuranceData.createdBy = req.user.id;
        insuranceData.createdByModel = req.user.role;

        let userCountry = await getUserCountry(req.user);
        if (!userCountry && req.body.country) userCountry = req.body.country;
        if (!userCountry) return res.status(400).json({ success: false, message: "Could not determine country." });
        
        insuranceData.country = userCountry;

        const newInsurance = await createInsuranceService(insuranceData);

        if (req.file) {
            const file = req.file;
            const key = `insurances/${newInsurance._id}/documents/policy_${Date.now()}_${file.originalname.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
            
            console.log(`[Insurance] Uploading document for ${newInsurance._id}...`);
            const uploadedUrl = await uploadToS3(file, key);

            const updatedInsurance = await updateInsuranceService(newInsurance._id, { "documents.policyDocumentUrl": uploadedUrl });
            
            // For the response, sign the URL immediately
            const responseData = updatedInsurance.toObject();
            responseData.documents.policyDocumentUrl = await getPresignedUrl(uploadedUrl);

            return res.status(201).json({ 
                success: true, 
                message: "Insurance created and verified on S3.",
                data: responseData 
            });
        }

        return res.status(201).json({ success: true, data: newInsurance });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Get all Insurances
 */
const getAllInsurances = async (req, res) => {
    try {
        const queryParams = { ...req.query };
        const options = { defaultSort: { createdAt: -1 } };
        const globalRoles = [ROLES.ADMIN, ROLES.OPERATIONADMIN, ROLES.FINANCEADMIN];

        if (!globalRoles.includes(req.user.role)) {
            const userCountry = await getUserCountry(req.user);
            if (!userCountry) return res.status(403).json({ success: false, message: "Country not found." });
            options.baseQuery = { country: userCountry };
        }

        options.populate = [{ path: "supplier", select: "name email phone" }];
        const result = await getAllInsurancesService(queryParams, options);

        // SECURE: Generate Presigned URLs for the list
        const processedData = await Promise.all(result.data.map(async (item) => {
            const obj = item.toObject();
            if (obj.documents?.policyDocumentUrl) {
                obj.documents.policyDocumentUrl = await getPresignedUrl(obj.documents.policyDocumentUrl);
            }
            return obj;
        }));

        return res.status(200).json({
            success: true,
            data: processedData,
            pagination: { total: result.total, page: result.page, limit: result.limit, totalPages: result.totalPages }
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Get eligible Insurances
 */
const getEligibleInsurances = async (req, res) => {
    try {
        const options = { baseQuery: { status: "ACTIVE" }, defaultSort: { createdAt: -1 } };
        const globalRoles = [ROLES.ADMIN, ROLES.OPERATIONADMIN, ROLES.FINANCEADMIN];

        if (!globalRoles.includes(req.user.role)) {
            const userCountry = await getUserCountry(req.user);
            if (!userCountry) return res.status(403).json({ success: false, message: "Country not found." });
            options.baseQuery.country = userCountry;
        }

        const result = await getAllInsurancesService(req.query, options);

        const processedData = await Promise.all(result.data.map(async (item) => {
            const obj = item.toObject();
            if (obj.documents?.policyDocumentUrl) {
                obj.documents.policyDocumentUrl = await getPresignedUrl(obj.documents.policyDocumentUrl);
            }
            return obj;
        }));

        return res.status(200).json({ success: true, data: processedData });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Get single Insurance
 */
const getInsuranceById = async (req, res) => {
    try {
        const insurance = await getInsuranceByIdService(req.params.id);
        if (!insurance) return res.status(404).json({ success: false, message: "Insurance not found" });
        
        if (insurance.populate) await insurance.populate("supplier", "name email phone");

        const obj = insurance.toObject();
        if (obj.documents?.policyDocumentUrl) {
            obj.documents.policyDocumentUrl = await getPresignedUrl(obj.documents.policyDocumentUrl);
        }

        return res.status(200).json({ success: true, data: obj });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

const updateInsurance = async (req, res) => {
    try {
        const updated = await updateInsuranceService(req.params.id, req.body);
        if (!updated) return res.status(404).json({ success: false, message: "Insurance not found" });
        return res.status(200).json({ success: true, data: updated });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

const deleteInsurance = async (req, res) => {
    try {
        const deleted = await deleteInsuranceService(req.params.id);
        if (!deleted) return res.status(404).json({ success: false, message: "Insurance not found" });
        return res.status(200).json({ success: true, message: "Insurance deleted successfully" });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

const uploadInsuranceDocument = async (req, res) => {
    try {
        const insuranceId = req.params.id;
        const file = req.file;
        if (!file) return res.status(400).json({ success: false, message: "No document uploaded" });

        const key = `insurances/${insuranceId}/documents/policy_${Date.now()}_${file.originalname.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
        const uploadedUrl = await uploadToS3(file, key);

        await updateInsuranceService(insuranceId, { "documents.policyDocumentUrl": uploadedUrl });
        const signedUrl = await getPresignedUrl(uploadedUrl);

        return res.status(200).json({
            success: true,
            message: "Document uploaded and verified.",
            data: { policyDocumentUrl: signedUrl }
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
