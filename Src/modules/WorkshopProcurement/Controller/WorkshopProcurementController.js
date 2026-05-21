const {
    addProcurementRequest,
    getProcurementRequests,
    getProcurementRequestById,
    updateProcurementRequest
} = require("../Repo/WorkshopProcurementRepo.js");
const { ROLES } = require("../../../shared/constants/roles.js");

exports.createRequest = async (req, res) => {
    try {
        const data = {
            ...req.body,
            requestedBy: req.user.id,
            requestedByRole: req.user.role,
            branch: req.user.branchId,
            requestNumber: `WR-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`
        };

        if (!data.branch) {
            return res.status(400).json({ success: false, message: "Branch ID is required" });
        }

        const request = await addProcurementRequest(data);
        res.status(201).json({ success: true, data: request });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.getRequests = async (req, res) => {
    try {
        const baseQuery = {};
        if (req.user.role === ROLES.WORKSHOPSTAFF) {
            baseQuery.requestedBy = req.user.id;
        } else if (req.user.role === ROLES.WORKSHOPMANAGER || req.user.role === ROLES.BRANCHMANAGER) {
            baseQuery.branch = req.user.branchId;
        }

        const result = await getProcurementRequests(req.query, { baseQuery });
        res.status(200).json({
            success: true,
            data: result.data,
            pagination: result.pagination
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.approveRequest = async (req, res) => {
    try {
        const { status, supplier, rejectionReason, quantity } = req.body;
        console.log("[DEBUG] approveRequest body:", req.body);

        if (!["APPROVED", "REJECTED"].includes(status)) {
            return res.status(400).json({ success: false, message: "Invalid status" });
        }

        const updateData = {
            status,
            approvedBy: req.user.id,
            approvedByRole: req.user.role,
            supplier: status === "APPROVED" ? supplier : undefined,
            rejectionReason: status === "REJECTED" ? rejectionReason : undefined,
            quantity: status === "APPROVED" && quantity ? quantity : undefined
        };
        console.log("[DEBUG] approveRequest updateData:", updateData);

        const request = await updateProcurementRequest(req.params.id, updateData);
        if (!request) {
            return res.status(404).json({ success: false, message: "Request not found" });
        }

        res.status(200).json({ success: true, data: request });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.getRequestById = async (req, res) => {
    try {
        const request = await getProcurementRequestById(req.params.id);
        if (!request) {
            return res.status(404).json({ success: false, message: "Request not found" });
        }
        res.status(200).json({ success: true, data: request });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
