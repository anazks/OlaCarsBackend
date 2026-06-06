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
    
    // Status translation
    if (filters.status) {
        const statusLower = filters.status.toLowerCase();
        if (statusLower === "active") {
            query.status = { $ne: "CLOSED" };
        } else if (statusLower === "closed") {
            query.status = "CLOSED";
        } else if (statusLower !== "all") {
            query.status = filters.status.toUpperCase();
        }
    }
    
    if (filters.branchId) query.branchId = filters.branchId;
    if (filters.vehicleId) query.vehicleId = filters.vehicleId;
    if (filters.workOrderId) query.workOrderId = filters.workOrderId;

    // Text Search
    if (filters.search) {
        const trimmedSearch = filters.search.trim();
        const escapedSearch = trimmedSearch.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        const searchRegex = new RegExp(escapedSearch, "i");
        query.$or = [
            { claimNumber: searchRegex },
            { policyNumber: searchRegex },
            { incidentDescription: searchRegex }
        ];
    }

    // Pagination
    const page = parseInt(filters.page) || 1;
    const limit = parseInt(filters.limit) || 15;
    const skip = (page - 1) * limit;

    const total = await InsuranceClaim.countDocuments(query);
    const pages = Math.ceil(total / limit);

    const data = await InsuranceClaim.find(query)
        .populate("workOrderId", "workOrderNumber status")
        .populate("vehicleId", "basicDetails.make basicDetails.model basicDetails.vin")
        .populate("branchId", "name")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);

    return {
        claims: data,
        pagination: {
            total,
            page,
            limit,
            pages
        }
    };
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
