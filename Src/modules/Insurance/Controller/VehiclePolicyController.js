const {
    createVehiclePolicyService,
    getAllVehiclePoliciesService,
    getVehiclePolicyByIdService,
    getVehiclePoliciesByVehicleIdService,
    updateVehiclePolicyService,
    deleteVehiclePolicyService
} = require("../Repo/VehiclePolicyRepo");
const uploadToS3 = require("../../../utils/uploadToS3"); 
const CountryManager = require("../../CountryManager/Model/CountryManagerModel");
const Branch = require("../../Branch/Model/BranchModel");
const { ROLES } = require("../../../shared/constants/roles");

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

const createVehiclePolicy = async (req, res) => {
    try {
        let policyData = req.body;
        policyData.createdBy = req.user.id;
        policyData.createdByModel = req.user.role; 

        const newPolicy = await createVehiclePolicyService(policyData);

        if (req.file) {
            const file = req.file;
            const key = `vehicle-policies/${newPolicy._id}/certificate_${Date.now()}_${file.originalname.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
            const uploadedKey = await uploadToS3(file, key);
            const updatedPolicy = await updateVehiclePolicyService(newPolicy._id, { certificate: uploadedKey });
            return res.status(201).json({ success: true, data: updatedPolicy });
        }

        return res.status(201).json({ success: true, data: newPolicy });
    } catch (error) {
        return res.status(error.cause || 500).json({ success: false, message: error.message });
    }
};

const getAllVehiclePolicies = async (req, res) => {
    try {
        const queryParams = { ...req.query };
        const options = { defaultSort: { createdAt: -1 } };
        // If needed, filtering could be applied via the master Insurance's country,
        // but for now we won't filter VehiclePolicy by country directly since it's removed from schema.

        const result = await getAllVehiclePoliciesService(queryParams, options);
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

const getVehiclePolicyById = async (req, res) => {
    try {
        const policy = await getVehiclePolicyByIdService(req.params.id);
        if (!policy) return res.status(404).json({ success: false, message: "Vehicle policy not found" });
        return res.status(200).json({ success: true, data: policy });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

const getVehiclePoliciesByVehicleId = async (req, res) => {
    try {
        const policies = await getVehiclePoliciesByVehicleIdService(req.params.vehicleId);
        return res.status(200).json({ success: true, data: policies });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

const updateVehiclePolicy = async (req, res) => {
    try {
        const updatedPolicy = await updateVehiclePolicyService(req.params.id, req.body);
        if (!updatedPolicy) return res.status(404).json({ success: false, message: "Vehicle policy not found" });
        return res.status(200).json({ success: true, data: updatedPolicy });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

const deleteVehiclePolicy = async (req, res) => {
    try {
        const deletedPolicy = await deleteVehiclePolicyService(req.params.id);
        if (!deletedPolicy) return res.status(404).json({ success: false, message: "Vehicle policy not found" });
        return res.status(200).json({ success: true, message: "Vehicle policy deleted successfully" });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = {
    createVehiclePolicy,
    getAllVehiclePolicies,
    getVehiclePolicyById,
    getVehiclePoliciesByVehicleId,
    updateVehiclePolicy,
    deleteVehiclePolicy
};
