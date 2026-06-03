const VehiclePolicy = require("../Model/VehiclePolicyModel");
const { applyQueryFeatures } = require("../../../shared/utils/queryHelper");

const updateExpiredPolicies = async () => {
    try {
        await VehiclePolicy.updateMany(
            { status: "ACTIVE", expiryDate: { $lt: new Date() } },
            { $set: { status: "EXPIRED" } }
        );
    } catch (error) {
        console.error("Error auto-expiring policies:", error);
    }
};

exports.createVehiclePolicyService = async (data) => {
    try {
        if (data.expiryDate && data.status !== "CANCELLED") {
            if (new Date(data.expiryDate) < new Date()) {
                data.status = "EXPIRED";
            }
        }
        const newPolicy = await VehiclePolicy.create(data);
        return newPolicy.toObject();
    } catch (error) {
        throw error;
    }
};

exports.getAllVehiclePoliciesService = async (queryParams = {}, options = {}) => {
    try {
        await updateExpiredPolicies();
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
        await updateExpiredPolicies();
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
        await updateExpiredPolicies();
        return await VehiclePolicy.find({ vehicle: vehicleId, status: { $in: ["ACTIVE", "EXPIRED"] } })
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
        if (updateData.expiryDate && updateData.status !== "CANCELLED") {
            if (new Date(updateData.expiryDate) < new Date()) {
                updateData.status = "EXPIRED";
            } else if (updateData.status === "EXPIRED") {
                updateData.status = "ACTIVE";
            }
        }
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
