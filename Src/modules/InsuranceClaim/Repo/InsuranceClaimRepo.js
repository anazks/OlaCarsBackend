const { InsuranceClaim } = require("../Model/InsuranceClaimModel");

/**
 * Auto-generates a claim number: IC-YYYYMM-XXXX
 */
const generateClaimNumber = async () => {
    const now = new Date();
    const prefix = `IC-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;

    const last = await InsuranceClaim.findOne(
        { claimNumber: { $regex: `^${prefix}` } },
        { claimNumber: 1 },
        { sort: { claimNumber: -1 } }
    );

    let seq = 1;
    if (last) {
        const lastSeq = parseInt(last.claimNumber.split("-").pop(), 10);
        seq = (lastSeq || 0) + 1;
    }

    return `${prefix}-${String(seq).padStart(4, "0")}`;
};

exports.createClaim = async (data) => {
    data.claimNumber = await generateClaimNumber();
    const claim = await InsuranceClaim.create(data);
    return claim.toObject();
};

exports.getClaims = async (filters = {}) => {
    const query = {};
    if (filters.status) query.status = filters.status;
    if (filters.branchId) query.branchId = filters.branchId;
    if (filters.vehicleId) query.vehicleId = filters.vehicleId;
    if (filters.workOrderId) query.workOrderId = filters.workOrderId;

    return await InsuranceClaim.find(query)
        .populate("workOrderId", "workOrderNumber status")
        .populate("vehicleId", "basicDetails.make basicDetails.model basicDetails.vin")
        .populate("branchId", "name")
        .sort({ createdAt: -1 });
};

exports.getClaimById = async (id) => {
    return await InsuranceClaim.findById(id)
        .populate("workOrderId")
        .populate("vehicleId", "basicDetails insurancePolicy")
        .populate("branchId", "name");
};

exports.updateClaim = async (id, updateData) => {
    return await InsuranceClaim.findByIdAndUpdate(
        id,
        { $set: updateData },
        { new: true, runValidators: true }
    );
};
