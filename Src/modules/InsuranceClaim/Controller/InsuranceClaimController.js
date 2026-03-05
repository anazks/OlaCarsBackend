const { getClaims, getClaimById } = require("../Repo/InsuranceClaimRepo");
const { createFromWorkOrder, progressClaim } = require("../Service/InsuranceClaimService");

const createClaimHandler = async (req, res) => {
    try {
        const { workOrderId, ...incidentData } = req.body;
        if (!workOrderId) return res.status(400).json({ success: false, message: "workOrderId is required" });
        const claim = await createFromWorkOrder(workOrderId, incidentData, req.user);
        return res.status(201).json({ success: true, data: claim });
    } catch (error) {
        const statusCode = error.cause || 500;
        return res.status(statusCode).json({ success: false, message: error.message });
    }
};

const getClaimsHandler = async (req, res) => {
    try {
        const claims = await getClaims(req.query);
        return res.status(200).json({ success: true, data: claims });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

const getClaimByIdHandler = async (req, res) => {
    try {
        const claim = await getClaimById(req.params.id);
        if (!claim) return res.status(404).json({ success: false, message: "Claim not found" });
        return res.status(200).json({ success: true, data: claim });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

const progressClaimHandler = async (req, res) => {
    try {
        const { targetStatus, ...payload } = req.body;
        const claim = await progressClaim(req.params.id, targetStatus, payload, req.user);
        return res.status(200).json({ success: true, data: claim });
    } catch (error) {
        const statusCode = error.cause || 500;
        return res.status(statusCode).json({ success: false, message: error.message });
    }
};

module.exports = {
    createClaimHandler,
    getClaimsHandler,
    getClaimByIdHandler,
    progressClaimHandler,
};
