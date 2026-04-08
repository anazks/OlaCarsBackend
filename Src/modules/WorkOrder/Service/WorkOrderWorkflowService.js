const { getWorkOrderById, updateWorkOrder } = require("../Repo/WorkOrderRepo");
const { WORK_ORDER_STATUSES } = require("../Model/WorkOrderModel");
const { ROLES } = require("../../../shared/constants/roles");
const { logLabourEntry } = require("./WorkOrderService");

// ─── Role Hierarchy (mirrors VehicleWorkflowService) ─────────────────
const ROLE_HIERARCHY = {
    [ROLES.OPERATIONSTAFF]: 1,
    [ROLES.FINANCESTAFF]: 1,
    [ROLES.WORKSHOPSTAFF]: 2,
    [ROLES.WORKSHOPMANAGER]: 3,
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

// ─── Status Transition Rules ─────────────────────────────────────────

const STATUS_RULES = {
    DRAFT: {
        allowedFrom: [],
        allowedRoles: [ROLES.WORKSHOPSTAFF, ROLES.OPERATIONSTAFF],
        minHierarchy: ROLES.BRANCHMANAGER,
    },
    APPROVED: {
        allowedFrom: ["DRAFT"],
        allowedRoles: [ROLES.BRANCHMANAGER, ROLES.WORKSHOPMANAGER, ROLES.COUNTRYMANAGER, ROLES.WORKSHOPSTAFF, ROLES.OPERATIONSTAFF],
        minHierarchy: ROLES.ADMIN,
    },
    REJECTED: {
        allowedFrom: ["DRAFT"],
        allowedRoles: [ROLES.WORKSHOPSTAFF, ROLES.BRANCHMANAGER, ROLES.COUNTRYMANAGER],
        minHierarchy: ROLES.ADMIN,
        gateValidator: (wo, payload) => {
            if (!payload.rejectionReason) {
                return "Rejection reason is required.";
            }
            return null;
        },
    },
    START: {
        allowedFrom: ["DRAFT"],
        allowedRoles: [ROLES.BRANCHMANAGER, ROLES.WORKSHOPMANAGER, ROLES.COUNTRYMANAGER, ROLES.WORKSHOPSTAFF, ROLES.OPERATIONSTAFF],
        minHierarchy: ROLES.ADMIN,
        gateValidator: async (wo, payload, user) => {
            return null;
        },
    },
    VEHICLE_CHECKED_IN: {
        allowedFrom: ["START", "APPROVED"],
        allowedRoles: [ROLES.WORKSHOPSTAFF],
        minHierarchy: ROLES.BRANCHMANAGER,
        gateValidator: (wo, payload) => {
            const vehicleOdo = wo.vehicleId?.basicDetails?.odometer;
            if (!payload.odometerAtEntry && !wo.odometerAtEntry && !vehicleOdo) {
                return "Odometer reading at entry is required for vehicle check-in.";
            }
            return null;
        },
    },
    PARTS_REQUESTED: {
        allowedFrom: ["IN_PROGRESS"],
        allowedRoles: [ROLES.WORKSHOPSTAFF],
        minHierarchy: ROLES.BRANCHMANAGER,
        gateValidator: (wo, payload) => {
            const parts = payload.parts || wo.parts || [];
            const tasks = payload.tasks || wo.tasks || [];
            
            if (!tasks.length) {
                return "At least one task must be defined before requesting parts.";
            }

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
        allowedFrom: ["VEHICLE_CHECKED_IN", "PARTS_RECEIVED", "PAUSED", "FAILED_QC", "START", "APPROVED"],
        allowedRoles: [ROLES.WORKSHOPSTAFF],
        minHierarchy: ROLES.BRANCHMANAGER,
        gateValidator: (wo, payload) => {
            if (wo.status === "VEHICLE_CHECKED_IN" && (!wo.tasks || wo.tasks.length === 0)) {
                return "At least one task must be added before starting work.";
            }
            if (!wo.assignedTechnician && !payload.assignedTechnician) {
                return "A technician must be assigned before work can begin.";
            }
            if (["START", "APPROVED"].includes(wo.status) && !wo.odometerAtEntry && !payload.odometerAtEntry) {
                return "Vehicle must be checked-in (odometer recorded) before work can begin.";
            }
            return null;
        },
    },
    PAUSED: {
        allowedFrom: ["IN_PROGRESS"],
        allowedRoles: [ROLES.WORKSHOPSTAFF],
        minHierarchy: ROLES.BRANCHMANAGER,
        gateValidator: (wo, payload) => {
            const reason = payload.pauseReason || payload.notes || wo.pauseReason;
            if (!reason || (typeof reason === 'string' && reason.trim() === "")) {
                return `Pause reason is required.`;
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
            // Validate QC Checklist
            const qcItems = wo.qcChecklist || [];
            if (qcItems.length > 0) {
                const mandatoryFails = qcItems.filter(
                    (item) => item.isMandatory && item.result === "FAIL"
                );
                if (mandatoryFails.length > 0) {
                    return `${mandatoryFails.length} mandatory QC item(s) failed. Cannot release vehicle.`;
                }
            }

            // Validate Photo Requirements
            const requiredPhotos = wo.requiredPhotos || [];
            const uploadedPhotos = wo.photos || [];
            
            if (requiredPhotos.length > 0) {
                const missingMandatory = requiredPhotos.filter(rp => 
                    rp.isMandatory && !uploadedPhotos.some(up => up.caption === rp.label)
                );
                if (missingMandatory.length > 0) {
                    return `Mandatory photos missing: ${missingMandatory.map(m => m.label).join(", ")}`;
                }
            } else if (uploadedPhotos.length < 4) {
                return `Minimum 4 QC/repair photos required. Currently ${uploadedPhotos.length} uploaded.`;
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
        allowedRoles: [ROLES.FINANCESTAFF, ROLES.BRANCHMANAGER, ROLES.WORKSHOPMANAGER],
        minHierarchy: ROLES.ADMIN,
    },
    CANCELLED: {
        allowedFrom: ["DRAFT", "START", "APPROVED", "REJECTED"],
        allowedRoles: [ROLES.BRANCHMANAGER, ROLES.WORKSHOPMANAGER],
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
    if (["START", "APPROVED"].includes(targetStatus)) {
        console.log(`[WorkOrder] WO ${workOrder.workOrderNumber} started/approved. Ready for vehicle check-in.`);
    }

    if (targetStatus === "VEHICLE_RELEASED") {
        console.log(`[WorkOrder] Vehicle released from WO ${workOrder.workOrderNumber}. Triggering vehicle status sync.`);
    }

    if (targetStatus === "CANCELLED") {
        console.log(`[WorkOrder] WO ${workOrder.workOrderNumber} cancelled. Releasing reserved inventory.`);
    }

    if (targetStatus === "PAUSED") {
        const { logLabourEntry } = require("./WorkOrderService");
        const technicianId = workOrder.assignedTechnician;
        if (technicianId) {
            try {
                await logLabourEntry(workOrder._id, {
                    technicianId: technicianId,
                    action: "PAUSE",
                    notes: workOrder.pauseReason || "Work order paused",
                });
            } catch (err) {
                console.warn(`[WorkOrder] Auto-pause failed: ${err.message}`);
            }
        }
    }

    if (targetStatus === "QUALITY_CHECK") {
        const { logLabourEntry } = require("./WorkOrderService");
        const techLastActions = {};
        for (const log of workOrder.labourLog || []) {
            techLastActions[log.technicianId.toString()] = log.action;
        }

        for (const [techId, lastAction] of Object.entries(techLastActions)) {
            if (["CLOCK_IN", "RESUME"].includes(lastAction)) {
                try {
                    await logLabourEntry(workOrder._id, {
                        technicianId: techId,
                        action: "CLOCK_OUT",
                        notes: "Auto-clocked out at Quality Check",
                    });
                } catch (err) {
                    console.warn(`[WorkOrder] Auto-clock-out failed for ${techId}: ${err.message}`);
                }
            }
        }
    }

    if (targetStatus === "IN_PROGRESS" && workOrder.statusHistory.length > 0) {
        const lastStatus = workOrder.statusHistory[workOrder.statusHistory.length - 2]?.status;
        if (lastStatus === "PAUSED") {
            const { logLabourEntry } = require("./WorkOrderService");
            const technicianId = workOrder.assignedTechnician;
            if (technicianId) {
                try {
                    await logLabourEntry(workOrder._id, {
                        technicianId: technicianId,
                        action: "RESUME",
                        notes: "Work order resumed",
                    });
                } catch (err) {
                    console.warn(`[WorkOrder] Auto-resume failed: ${err.message}`);
                }
            }
        }
    }

    // Automated Labour Tracking
    try {
        if (targetStatus === "IN_PROGRESS") {
            await logLabourEntry(workOrder._id, {
                technicianId: user.id,
                action: "CLOCK_IN",
                notes: "Automated clock-in on IN_PROGRESS transition"
            });
        }
    } catch (labourError) {
        console.error(`[WorkOrder] Failed to automate labour log: ${labourError.message}`);
    }
};

// ─── Main Workflow Engine ────────────────────────────────────────────

const processWorkOrderProgress = async (woId, targetStatus, updateData, user) => {
    const currentWO = await getWorkOrderById(woId);
    if (!currentWO) throw new Error("Work order not found.", { cause: 404 });

    if (!WORK_ORDER_STATUSES.includes(targetStatus) && targetStatus !== "APPROVED") {
        throw new Error("Invalid target status provided.", { cause: 400 });
    }

    if (currentWO.status === targetStatus) {
        return await updateWorkOrder(woId, updateData);
    }

    const rule = STATUS_RULES[targetStatus];
    if (!rule) throw new Error("Invalid target status configuration.", { cause: 500 });

    if (!rule.allowedFrom.includes(currentWO.status)) {
        throw new Error(`Invalid transition from '${currentWO.status}' to '${targetStatus}'.`, { cause: 400 });
    }

    if (!checkRoleAuth(user.role, rule.allowedRoles, rule.minHierarchy)) {
        throw new Error(`Role '${user.role}' is not authorized for '${targetStatus}'.`, { cause: 403 });
    }

    const payload = { ...updateData };
    if (rule.gateValidator) {
        const errorMsg = await rule.gateValidator(currentWO, payload, user);
        if (errorMsg) throw new Error(errorMsg, { cause: 400 });
    }

    if (["START", "APPROVED"].includes(targetStatus)) {
        payload.costApproval = {
            approvedBy: user.id,
            approvedByRole: user.role,
            approvedAt: new Date(),
            thresholdLevel: "NONE",
        };
    }

    if (targetStatus === "VEHICLE_CHECKED_IN" && !payload.odometerAtEntry && !currentWO.odometerAtEntry) {
        const vehicleOdo = currentWO.vehicleId?.basicDetails?.odometer;
        if (vehicleOdo) payload.odometerAtEntry = vehicleOdo;
    }

    if (targetStatus === "PAUSED") {
        payload.pauseReason = payload.pauseReason || payload.notes;
    }

    payload.status = targetStatus;
    const updatedWO = await updateWorkOrder(woId, payload);

    updatedWO.statusHistory.push({
        status: targetStatus,
        changedBy: user.id,
        changedByRole: user.role,
        notes: updateData?.notes || `Status changed to ${targetStatus}`,
    });

    await updatedWO.save();
    await triggerSideEffects(targetStatus, updatedWO, user);

    return updatedWO;
};

module.exports = {
    processWorkOrderProgress,
    STATUS_RULES,
    calculateSlaDeadline,
};
