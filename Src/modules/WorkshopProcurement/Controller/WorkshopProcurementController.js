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

        if (req.user.role === ROLES.WORKSHOPMANAGER || req.user.role === ROLES.BRANCHMANAGER) {
            data.status = "PENDING_FINANCE_APPROVAL";
        }

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

        if (!["APPROVED", "REJECTED", "PENDING_FINANCE_APPROVAL"].includes(status)) {
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

exports.auditProcurementRequest = async (req, res) => {
    try {
        const { id } = req.params;
        const { merchandiserPrice, documents } = req.body;

        if (merchandiserPrice === undefined || merchandiserPrice === null) {
            return res.status(400).json({ success: false, message: "Proposed unit price is required for audit." });
        }

        const WorkshopProcurement = require("../Model/WorkshopProcurementModel.js");
        const request = await WorkshopProcurement.findById(id).populate("part");
        if (!request) {
            return res.status(404).json({ success: false, message: "Procurement Request not found." });
        }

        if (!["APPROVED", "REJECTED", "PENDING_FINANCE_APPROVAL"].includes(request.status)) {
            return res.status(400).json({ success: false, message: `Request status must be APPROVED or REJECTED to submit audit. Current status: ${request.status}` });
        }

        const previousStatus = request.status;
        request.merchandiserPrice = Number(merchandiserPrice);
        request.merchandiserTotalAmount = Number(merchandiserPrice) * request.quantity;
        
        if (documents && Array.isArray(documents)) {
            request.documents = documents;
        }

        request.status = "PENDING_FINANCE_APPROVAL";

        if (!request.editHistory) request.editHistory = [];
        request.editHistory.push({
            editedAt: new Date(),
            editedBy: req.user.id,
            editorRole: req.user.role,
            previousStatus: previousStatus,
            changesSummary: `Merchandiser completed workshop request audit. Proposed price: ${merchandiserPrice}. Documents uploaded: ${(documents || []).length}.`
        });

        await request.save();

        res.status(200).json({
            success: true,
            message: "Workshop Procurement Request audited and submitted for approval successfully.",
            data: request
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.financeApproveRequest = async (req, res) => {
    try {
        const { id } = req.params;
        const { status, note } = req.body;
        const approverRole = req.user.role;
        const approverId = req.user.id;

        if (!["APPROVED", "REJECTED"].includes(status)) {
            return res.status(400).json({ success: false, message: "Invalid status. Must be APPROVED or REJECTED." });
        }

        const WorkshopProcurement = require("../Model/WorkshopProcurementModel.js");
        const request = await WorkshopProcurement.findById(id).populate("part");
        if (!request) {
            return res.status(404).json({ success: false, message: "Procurement Request not found." });
        }

        if (request.status !== "PENDING_FINANCE_APPROVAL") {
            return res.status(400).json({ success: false, message: "Request is not in PENDING_FINANCE_APPROVAL status." });
        }

        // Enforce "No self-approval"
        if (request.requestedBy && request.requestedBy.toString() === approverId) {
            return res.status(403).json({ success: false, message: "You cannot approve your own Purchase Request." });
        }

        const previousStatus = request.status;
        request.status = status;
        request.approvedBy = approverId;
        request.approvedByRole = approverRole;

        const historyRecord = {
            editedAt: new Date(),
            editedBy: approverId,
            editorRole: approverRole,
            previousStatus: previousStatus,
            changesSummary: ""
        };

        if (status === "APPROVED") {
            request.approvalNote = note || "";
            if (request.part && request.part.unitCost) {
                request.originalTotalAmount = request.quantity * request.part.unitCost;
            } else {
                request.originalTotalAmount = 0;
            }
            historyRecord.changesSummary = `Finance approved merchandiser pricing. Total amount updated to proposed $${request.merchandiserTotalAmount}.`;
        } else if (status === "REJECTED") {
            request.rejectionNote = note || "";
            historyRecord.changesSummary = `Finance rejected merchandiser pricing. Note: "${note || 'No note provided'}"`;
        }

        if (!request.editHistory) request.editHistory = [];
        request.editHistory.push(historyRecord);

        await request.save();

        res.status(200).json({
            success: true,
            message: `Workshop Procurement Request successfully ${status.toLowerCase()}d.`,
            data: request
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
