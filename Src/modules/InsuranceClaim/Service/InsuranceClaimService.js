const { createClaim, getClaimById, updateClaim } = require("../Repo/InsuranceClaimRepo");
const { getWorkOrderById } = require("../../WorkOrder/Repo/WorkOrderRepo");
const { CLAIM_STATUSES } = require("../Model/InsuranceClaimModel");

// ─── Claim State Machine ─────────────────────────────────────────────

const CLAIM_RULES = {
    SUBMITTED: {
        allowedFrom: ["DRAFT"],
        gateValidator: (claim) => {
            if (!claim.incidentDate) return "Incident date is required.";
            if (!claim.incidentDescription) return "Incident description is required.";
            if (!claim.claimAmount || claim.claimAmount <= 0) return "Claim amount must be greater than 0.";
            return null;
        },
    },
    UNDER_REVIEW: {
        allowedFrom: ["SUBMITTED"],
    },
    APPROVED: {
        allowedFrom: ["UNDER_REVIEW"],
        gateValidator: (claim, payload) => {
            if (!payload.approvedAmount && payload.approvedAmount !== 0) {
                return "Approved amount is required.";
            }
            return null;
        },
    },
    REJECTED: {
        allowedFrom: ["UNDER_REVIEW"],
        gateValidator: (claim, payload) => {
            if (!payload.rejectionReason) return "Rejection reason is required.";
            return null;
        },
    },
    PAYMENT_RECEIVED: {
        allowedFrom: ["APPROVED"],
        gateValidator: (claim, payload) => {
            if (!payload.paymentReference) return "Payment reference is required.";
            if (!payload.paymentAmount && payload.paymentAmount !== 0) return "Payment amount is required.";
            return null;
        },
    },
    CLOSED: {
        allowedFrom: ["PAYMENT_RECEIVED", "REJECTED"],
    },
};

/**
 * Create an InsuranceClaim from a Work Order, auto-populating vehicle insurance data.
 */
const createFromWorkOrder = async (woId, incidentData, user) => {
    const wo = await getWorkOrderById(woId);
    if (!wo) throw new Error("Work order not found.", { cause: 404 });

    if (wo.workOrderType !== "ACCIDENT") {
        throw new Error("Insurance claims can only be created for ACCIDENT work orders.", { cause: 400 });
    }

    // Auto-populate from vehicle insurance
    const vehicle = wo.vehicleId; // populated by getWorkOrderById
    const insurance = vehicle?.insurancePolicy || {};

    const claimData = {
        workOrderId: wo._id,
        vehicleId: vehicle._id || wo.vehicleId,
        branchId: wo.branchId,
        incidentDate: incidentData.incidentDate,
        incidentDescription: incidentData.incidentDescription,
        incidentLocation: incidentData.incidentLocation,
        policeReportNumber: incidentData.policeReportNumber,
        policeReportDocument: incidentData.policeReportDocument,
        insurerName: incidentData.insurerName || insurance.providerName || "Unknown",
        policyNumber: incidentData.policyNumber || insurance.policyNumber || "Unknown",
        insuranceType: insurance.insuranceType,
        excessAmount: incidentData.excessAmount || insurance.excessAmount || 0,
        claimAmount: incidentData.claimAmount,
        notes: incidentData.notes,
        createdBy: user.id,
        creatorRole: user.role,
        statusHistory: [
            {
                status: "DRAFT",
                changedBy: user.id,
                changedByRole: user.role,
                notes: "Claim created",
            },
        ],
    };

    return await createClaim(claimData);
};

/**
 * Progress a claim through the state machine.
 */
const progressClaim = async (claimId, targetStatus, payload, user) => {
    const claim = await getClaimById(claimId);
    if (!claim) throw new Error("Insurance claim not found.", { cause: 404 });

    if (!CLAIM_STATUSES.includes(targetStatus)) {
        throw new Error("Invalid target status.", { cause: 400 });
    }

    const rule = CLAIM_RULES[targetStatus];
    if (!rule) throw new Error("No transition rule for this status.", { cause: 400 });

    if (!rule.allowedFrom.includes(claim.status)) {
        throw new Error(
            `Cannot transition from '${claim.status}' to '${targetStatus}'.`,
            { cause: 400 }
        );
    }

    if (rule.gateValidator) {
        const err = rule.gateValidator(claim, payload);
        if (err) throw new Error(err, { cause: 400 });
    }

    // Build update
    const update = { ...payload, status: targetStatus };

    // Set timestamps
    if (targetStatus === "SUBMITTED") update.submittedAt = new Date();
    if (targetStatus === "UNDER_REVIEW") update.reviewStartedAt = new Date();
    if (targetStatus === "APPROVED" || targetStatus === "REJECTED" || targetStatus === "CLOSED") {
        update.resolvedAt = new Date();
    }

    // Compute net payable on approval
    if (targetStatus === "APPROVED") {
        update.netPayable = (payload.approvedAmount || 0) - (claim.excessAmount || 0);
    }

    // Set payment fields
    if (targetStatus === "PAYMENT_RECEIVED") {
        update.paymentDate = new Date();
    }

    const updated = await updateClaim(claimId, update);

    // Push to status history
    updated.statusHistory.push({
        status: targetStatus,
        changedBy: user.id,
        changedByRole: user.role,
        notes: payload.notes || `Status changed to ${targetStatus}`,
    });
    await updated.save();

    return updated;
};

module.exports = {
    createFromWorkOrder,
    progressClaim,
};
