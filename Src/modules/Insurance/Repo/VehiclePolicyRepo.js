const VehiclePolicy = require("../Model/VehiclePolicyModel");
const { applyQueryFeatures } = require("../../../shared/utils/queryHelper");

exports.createVehiclePolicyService = async (data) => {
    try {
        const newPolicy = await VehiclePolicy.create(data);
        return newPolicy.toObject();
    } catch (error) {
        throw error;
    }
};

exports.getAllVehiclePoliciesService = async (queryParams = {}, options = {}) => {
    try {
        const queryOptions = {
            searchFields: ["policyNumber"],
            filterFields: ["status", "country", "vehicle", "insurance"],
            dateFilterField: "createdAt",
            populate: [
                { path: "vehicle", select: "basicDetails legalDocs" },
                { 
                    path: "insurance", 
                    populate: { path: "supplier", select: "name email phone" }
                }
            ],
            ...options
        };

        return await applyQueryFeatures(VehiclePolicy, queryParams, queryOptions);
    } catch (error) {
        throw error;
    }
};

exports.getVehiclePolicyByIdService = async (id) => {
    try {
        return await VehiclePolicy.findById(id)
            .populate("vehicle", "basicDetails legalDocs")
            .populate({
                path: "insurance",
                populate: { path: "supplier", select: "name email phone" }
            });
    } catch (error) {
        throw error;
    }
};

exports.getVehiclePoliciesByVehicleIdService = async (vehicleId) => {
    try {
        return await VehiclePolicy.find({ vehicle: vehicleId })
            .populate({
                path: "insurance",
                populate: { path: "supplier", select: "name email phone" }
            })
            .sort({ createdAt: -1 });
    } catch (error) {
        throw error;
    }
};

exports.updateVehiclePolicyService = async (id, updateData) => {
    try {
        return await VehiclePolicy.findByIdAndUpdate(id, updateData, { new: true, runValidators: true });
    } catch (error) {
        throw error;
    }
};

exports.deleteVehiclePolicyService = async (id) => {
    try {
        return await VehiclePolicy.findByIdAndDelete(id);
    } catch (error) {
        throw error;
    }
};
