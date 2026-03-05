const { ServiceBill } = require("../Model/ServiceBillModel");

/**
 * Auto-generates a bill number: SB-YYYYMM-XXXX
 */
const generateBillNumber = async () => {
    const now = new Date();
    const prefix = `SB-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;

    const last = await ServiceBill.findOne(
        { billNumber: { $regex: `^${prefix}` } },
        { billNumber: 1 },
        { sort: { billNumber: -1 } }
    );

    let seq = 1;
    if (last) {
        const lastSeq = parseInt(last.billNumber.split("-").pop(), 10);
        seq = (lastSeq || 0) + 1;
    }

    return `${prefix}-${String(seq).padStart(4, "0")}`;
};

/**
 * Create a new service bill.
 */
exports.createBill = async (data) => {
    try {
        data.billNumber = await generateBillNumber();
        const bill = await ServiceBill.create(data);
        return bill.toObject();
    } catch (error) {
        throw error;
    }
};

/**
 * Get all service bills with filters.
 */
exports.getBills = async (filters = {}) => {
    try {
        const query = {};
        if (filters.status) query.status = filters.status;
        if (filters.branchId) query.branchId = filters.branchId;
        if (filters.workOrderId) query.workOrderId = filters.workOrderId;
        if (filters.paymentStatus) query.paymentStatus = filters.paymentStatus;

        return await ServiceBill.find(query)
            .populate("workOrderId", "workOrderNumber status")
            .populate("vehicleId", "basicDetails.make basicDetails.model basicDetails.vin")
            .populate("branchId", "name")
            .sort({ createdAt: -1 });
    } catch (error) {
        throw error;
    }
};

/**
 * Get a single bill by ID.
 */
exports.getBillById = async (id) => {
    try {
        return await ServiceBill.findById(id)
            .populate("workOrderId")
            .populate("vehicleId", "basicDetails.make basicDetails.model basicDetails.vin")
            .populate("branchId", "name")
            .populate("approvedBy", "name email");
    } catch (error) {
        throw error;
    }
};

/**
 * Update a bill.
 */
exports.updateBill = async (id, updateData) => {
    try {
        return await ServiceBill.findByIdAndUpdate(
            id,
            { $set: updateData },
            { new: true, runValidators: true }
        );
    } catch (error) {
        throw error;
    }
};
