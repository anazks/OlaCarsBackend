const { getWorkOrderById, updateWorkOrder } = require("../Repo/WorkOrderRepo");
const { WORK_ORDER_STATUSES } = require("../Model/WorkOrderModel");
const { ROLES } = require("../../../shared/constants/roles");

// ─── Role Hierarchy (mirrors VehicleWorkflowService) ─────────────────
const ROLE_HIERARCHY = {
    [ROLES.OPERATIONSTAFF]: 1,
    [ROLES.FINANCESTAFF]: 1,
    [ROLES.WORKSHOPSTAFF]: 2,
    [ROLES.BRANCHMANAGER]: 3,
    [ROLES.COUNTRYMANAGER]: 4,
    [ROLES.OPERATIONADMIN]: 5,
    [ROLES.FINANCEADMIN]: 5,
    [ROLES.ADMIN]: 6,
};

const checkRoleAuth = (userRole, allowedRoles, minimumHierarchyRole) => {
    if (allowedRoles.includes(userRole)) return true;
    if (minimumHierarchyRole && ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[minimumHierarchyRole]) return true;
    return false;
};

// ─── SLA Deadlines by Priority ───────────────────────────────────────
const SLA_HOURS = {
    CRITICAL: 4,
    HIGH: 24,
    MEDIUM: 72,
    LOW: 168, // 7 days
};

const calculateSlaDeadline = (priority) => {
    const hours = SLA_HOURS[priority] || SLA_HOURS.MEDIUM;
    return new Date(Date.now() + hours * 60 * 60 * 1000);
};

// ─── Cost Approval Thresholds ────────────────────────────────────────
const determineCostApprovalLevel = (estimatedTotalCost) => {
    if (estimatedTotalCost <= 200) return "AUTO";
    if (estimatedTotalCost <= 1000) return "BRANCH";
    if (estimatedTotalCost <= 5000) return "COUNTRY";
    return "ADMIN";
};

const canRoleApproveLevel = (userRole, level) => {
    const approvalMap = {
        AUTO: [], // no one needed
        BRANCH: [ROLES.BRANCHMANAGER],
        COUNTRY: [ROLES.COUNTRYMANAGER],
        ADMIN: [ROLES.ADMIN],
    };
    const allowed = approvalMap[level] || [];
    return checkRoleAuth(userRole, allowed, allowed[0] || ROLES.ADMIN);
};

// ─── Status Transition Rules ─────────────────────────────────────────

const STATUS_RULES = {
    DRAFT: {
        allowedFrom: [],
        allowedRoles: [ROLES.WORKSHOPSTAFF, ROLES.OPERATIONSTAFF],
        minHierarchy: ROLES.BRANCHMANAGER,
    },
    PENDING_APPROVAL: {
        allowedFrom: ["DRAFT", "ADDITIONAL_WORK_FOUND"],
        allowedRoles: [ROLES.WORKSHOPSTAFF, ROLES.OPERATIONSTAFF],
        minHierarchy: ROLES.BRANCHMANAGER,
        gateValidator: (wo, payload) => {
            if (!wo.estimatedTotalCost || wo.estimatedTotalCost <= 0) {
                return "Estimated total cost must be greater than 0 before requesting approval.";
            }
            return null;
        },
    },
    APPROVED: {
        allowedFrom: ["PENDING_APPROVAL"],
        allowedRoles: [ROLES.BRANCHMANAGER, ROLES.COUNTRYMANAGER],
        minHierarchy: ROLES.ADMIN,
        gateValidator: (wo, payload, user) => {
            const requiredLevel = determineCostApprovalLevel(wo.estimatedTotalCost);
            if (requiredLevel === "AUTO") return null; // auto-approved handled in side effects
            if (!canRoleApproveLevel(user.role, requiredLevel)) {
                return `Cost of $${wo.estimatedTotalCost} requires ${requiredLevel}-level approval. Your role cannot approve this.`;
            }
            return null;
        },
    },
    REJECTED: {
        allowedFrom: ["PENDING_APPROVAL"],
        allowedRoles: [ROLES.BRANCHMANAGER, ROLES.COUNTRYMANAGER],
        minHierarchy: ROLES.ADMIN,
        gateValidator: (wo, payload) => {
            if (!payload.rejectionReason) {
                return "Rejection reason is required.";
            }
            return null;
        },
    },
    VEHICLE_CHECKED_IN: {
        allowedFrom: ["APPROVED"],
        allowedRoles: [ROLES.WORKSHOPSTAFF],
        minHierarchy: ROLES.BRANCHMANAGER,
        gateValidator: (wo, payload) => {
            if (!payload.odometerAtEntry && !wo.odometerAtEntry) {
                return "Odometer reading at entry is required for vehicle check-in.";
            }
            return null;
        },
    },
    PARTS_REQUESTED: {
        allowedFrom: ["VEHICLE_CHECKED_IN", "IN_PROGRESS"],
        allowedRoles: [ROLES.WORKSHOPSTAFF],
        minHierarchy: ROLES.BRANCHMANAGER,
        gateValidator: (wo, payload) => {
            const parts = payload.parts || wo.parts || [];
            if (!parts.length) {
                return "At least one part must be listed before requesting parts.";
            }
            return null;
        },
    },
    PARTS_RECEIVED: {
        allowedFrom: ["PARTS_REQUESTED"],
        allowedRoles: [ROLES.WORKSHOPSTAFF, ROLES.OPERATIONSTAFF],
        minHierarchy: ROLES.BRANCHMANAGER,
    },
    IN_PROGRESS: {
        allowedFrom: ["VEHICLE_CHECKED_IN", "PARTS_RECEIVED", "PAUSED", "FAILED_QC"],
        allowedRoles: [ROLES.WORKSHOPSTAFF],
        minHierarchy: ROLES.BRANCHMANAGER,
        gateValidator: (wo, payload) => {
            if (!wo.assignedTechnician && !payload.assignedTechnician) {
                return "A technician must be assigned before work can begin.";
            }
            return null;
        },
    },
    PAUSED: {
        allowedFrom: ["IN_PROGRESS"],
        allowedRoles: [ROLES.WORKSHOPSTAFF],
        minHierarchy: ROLES.BRANCHMANAGER,
        gateValidator: (wo, payload) => {
            if (!payload.pauseReason) {
                return "Pause reason is required.";
            }
            return null;
        },
    },
    ADDITIONAL_WORK_FOUND: {
        allowedFrom: ["IN_PROGRESS"],
        allowedRoles: [ROLES.WORKSHOPSTAFF],
        minHierarchy: ROLES.BRANCHMANAGER,
        gateValidator: (wo, payload) => {
            if (!payload.additionalWorkScope) {
                return "Description of additional work scope is required.";
            }
            return null;
        },
    },
    QUALITY_CHECK: {
        allowedFrom: ["IN_PROGRESS"],
        allowedRoles: [ROLES.WORKSHOPSTAFF],
        minHierarchy: ROLES.BRANCHMANAGER,
        gateValidator: (wo, payload) => {
            const tasks = wo.tasks || [];
            const incompleteTasks = tasks.filter(
                (t) => t.status !== "COMPLETED" && t.status !== "SKIPPED"
            );
            if (tasks.length > 0 && incompleteTasks.length > 0) {
                return `${incompleteTasks.length} task(s) are still incomplete. All tasks must be completed or skipped before QC.`;
            }
            return null;
        },
    },
    FAILED_QC: {
        allowedFrom: ["QUALITY_CHECK"],
        allowedRoles: [ROLES.WORKSHOPSTAFF, ROLES.OPERATIONSTAFF],
        minHierarchy: ROLES.BRANCHMANAGER,
        gateValidator: (wo, payload) => {
            if (!payload.notes) {
                return "Notes describing the QC failure are required.";
            }
            return null;
        },
    },
    READY_FOR_RELEASE: {
        allowedFrom: ["QUALITY_CHECK"],
        allowedRoles: [ROLES.WORKSHOPSTAFF, ROLES.OPERATIONSTAFF],
        minHierarchy: ROLES.BRANCHMANAGER,
        gateValidator: (wo, payload) => {
            const qcItems = wo.qcChecklist || [];
            if (qcItems.length > 0) {
                const mandatoryFails = qcItems.filter(
                    (item) => item.isMandatory && item.result === "FAIL"
                );
                if (mandatoryFails.length > 0) {
                    return `${mandatoryFails.length} mandatory QC item(s) failed. Cannot release vehicle.`;
                }
            }
            const photos = wo.qcPhotos || [];
            if (photos.length < 4) {
                return `Minimum 4 QC/repair photos required. Currently ${photos.length} uploaded.`;
            }
            return null;
        },
    },
    VEHICLE_RELEASED: {
        allowedFrom: ["READY_FOR_RELEASE"],
        allowedRoles: [ROLES.WORKSHOPSTAFF, ROLES.OPERATIONSTAFF],
        minHierarchy: ROLES.BRANCHMANAGER,
        gateValidator: (wo, payload) => {
            if (!payload.odometerAtRelease && !wo.odometerAtRelease) {
                return "Final odometer reading is required for vehicle release.";
            }
            return null;
        },
    },
    INVOICED: {
        allowedFrom: ["VEHICLE_RELEASED"],
        allowedRoles: [ROLES.FINANCESTAFF],
        minHierarchy: ROLES.FINANCEADMIN,
        gateValidator: (wo, payload) => {
            if (!wo.serviceBillId && !payload.serviceBillId) {
                return "A service bill must be generated and linked before invoicing.";
            }
            return null;
        },
    },
    CLOSED: {
        allowedFrom: ["INVOICED"],
        allowedRoles: [ROLES.FINANCESTAFF, ROLES.BRANCHMANAGER],
        minHierarchy: ROLES.ADMIN,
    },
    CANCELLED: {
        allowedFrom: ["DRAFT", "PENDING_APPROVAL", "APPROVED", "REJECTED"],
        allowedRoles: [ROLES.BRANCHMANAGER],
        minHierarchy: ROLES.COUNTRYMANAGER,
        gateValidator: (wo, payload) => {
            if (!payload.cancellationReason) {
                return "Cancellation reason is required.";
            }
            return null;
        },
    },
};

// ─── Side Effects ────────────────────────────────────────────────────

const triggerSideEffects = async (targetStatus, workOrder, user) => {
    if (targetStatus === "APPROVED" || targetStatus === "PENDING_APPROVAL") {
        // Auto-approve if cost ≤ $200
        const level = determineCostApprovalLevel(workOrder.estimatedTotalCost);
        if (level === "AUTO" && targetStatus === "PENDING_APPROVAL") {
            console.log(`[WorkOrder] Auto-approving WO ${workOrder.workOrderNumber} (cost ≤ $200)`);
            workOrder.costApproval = {
                approvedBy: user.id,
                approvedByRole: user.role,
                approvedAt: new Date(),
                thresholdLevel: "AUTO",
            };
            workOrder.status = "APPROVED";
            workOrder.statusHistory.push({
                status: "APPROVED",
                changedBy: user.id,
                changedByRole: user.role,
                notes: "Auto-approved: estimated cost within auto-approval threshold ($200).",
            });
            await workOrder.save();
        }
    }

    if (targetStatus === "APPROVED") {
        console.log(`[WorkOrder] WO ${workOrder.workOrderNumber} approved. Ready for vehicle check-in.`);
    }

    if (targetStatus === "VEHICLE_RELEASED") {
        console.log(`[WorkOrder] Vehicle released from WO ${workOrder.workOrderNumber}. Triggering vehicle status sync → ACTIVE — AVAILABLE.`);
        // Future: call Vehicle workflow to set status to ACTIVE — AVAILABLE
    }

    if (targetStatus === "CANCELLED") {
        console.log(`[WorkOrder] WO ${workOrder.workOrderNumber} cancelled. Releasing any reserved inventory.`);
        // Future: release reserved parts back to inventory
    }

    if (targetStatus === "ADDITIONAL_WORK_FOUND") {
        // Check if cost increase > 20% → re-approval
        const originalCost = workOrder.estimatedTotalCost || 0;
        const newEstimate = workOrder.additionalWorkScope ? originalCost * 1.2 : originalCost;
        if (newEstimate > originalCost * 1.2) {
            console.log(`[WorkOrder] Cost increase >20% detected on WO ${workOrder.workOrderNumber}. Re-approval required.`);
        }
    }
};

// ─── Main Workflow Engine ────────────────────────────────────────────

/**
 * Unified work order status transition engine.
 * @param {string} woId - Work Order ID
 * @param {string} targetStatus - Target status
 * @param {Object} updateData - Data payload for the transition
 * @param {Object} user - { id, role } from JWT
 * @returns {Promise<Object>} Updated work order
 */
const processWorkOrderProgress = async (woId, targetStatus, updateData, user) => {
    const currentWO = await getWorkOrderById(woId);
    if (!currentWO) {
        throw new Error("Work order not found.", { cause: 404 });
    }

    if (!WORK_ORDER_STATUSES.includes(targetStatus)) {
        throw new Error("Invalid target status provided.", { cause: 400 });
    }

    // Same-status update (just applying data without transition)
    if (currentWO.status === targetStatus) {
        return await updateWorkOrder(woId, updateData);
    }

    const rule = STATUS_RULES[targetStatus];
    if (!rule) {
        throw new Error("Invalid target status configuration.", { cause: 500 });
    }

    // Validate transition path
    if (!rule.allowedFrom.includes(currentWO.status)) {
        throw new Error(
            `Invalid transition. Cannot progress from '${currentWO.status}' to '${targetStatus}'.`,
            { cause: 400 }
        );
    }

    // Validate role authorization
    if (!checkRoleAuth(user.role, rule.allowedRoles, rule.minHierarchy)) {
        throw new Error(
            `Role '${user.role}' is not authorized for the '${targetStatus}' transition.`,
            { cause: 403 }
        );
    }

    // Run gate validator
    const payload = { ...updateData };
    if (rule.gateValidator) {
        const errorMsg = rule.gateValidator(currentWO, payload, user);
        if (errorMsg) {
            throw new Error(errorMsg, { cause: 400 });
        }
    }

    // ── Pre-transition logic ─────────────────────────────────────

    // Set cost approval on APPROVED
    if (targetStatus === "APPROVED") {
        payload.costApproval = {
            approvedBy: user.id,
            approvedByRole: user.role,
            approvedAt: new Date(),
            thresholdLevel: determineCostApprovalLevel(currentWO.estimatedTotalCost),
        };
    }

    // Set rejection reason
    if (targetStatus === "REJECTED" && payload.rejectionReason) {
        payload.rejectionReason = payload.rejectionReason;
    }

    // ── Apply status change ──────────────────────────────────────
    payload.status = targetStatus;
    const updatedWO = await updateWorkOrder(woId, payload);

    // Record in audit trail
    updatedWO.statusHistory.push({
        status: targetStatus,
        changedBy: user.id,
        changedByRole: user.role,
        notes: updateData?.notes || `Status changed from ${currentWO.status} to ${targetStatus}`,
    });

    await updatedWO.save();

    // ── Post-transition side effects ─────────────────────────────
    await triggerSideEffects(targetStatus, updatedWO, user);

    return updatedWO;
};

module.exports = {
    processWorkOrderProgress,
    STATUS_RULES,
    determineCostApprovalLevel,
    calculateSlaDeadline,
};
