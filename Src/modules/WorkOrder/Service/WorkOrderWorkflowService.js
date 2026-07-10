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
            if (!wo.actualLabourHours || wo.actualLabourHours <= 0) {
                return "Work start and end times must be updated (actual labour hours must be greater than 0) before proceeding to Quality Check.";
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
            // Validate Tasks and Parts Verification Checklist (evidence gating)
            const tasks = wo.tasks || [];
            const incompleteTasks = tasks.filter(
                (t) => t.status !== "COMPLETED" && t.status !== "SKIPPED"
            );
            if (tasks.length > 0 && incompleteTasks.length > 0) {
                return `${incompleteTasks.length} task(s) are still incomplete. All tasks must be completed or skipped before release.`;
            }

            const parts = wo.parts || [];
            const uninstalledParts = parts.filter(
                (p) => p.status !== "INSTALLED" && p.status !== "RETURNED"
            );
            if (parts.length > 0 && uninstalledParts.length > 0) {
                return `${uninstalledParts.length} listed part(s) are not installed. All listed parts must be installed or returned before release.`;
            }

            // Enforce photo uploads for completed tasks and installed parts
            const uploadedPhotos = wo.photos || [];
            const missingTaskPhotos = tasks.filter(t => 
                t.status === "COMPLETED" && !uploadedPhotos.some(up => up.caption === `TASK_${t._id}`)
            );
            if (missingTaskPhotos.length > 0) {
                return `Photo verification required for completed tasks: ${missingTaskPhotos.map(t => t.description).join(", ")}`;
            }

            const missingPartPhotos = parts.filter(p => 
                p.status === "INSTALLED" && !uploadedPhotos.some(up => up.caption === `PART_${p._id}`)
            );
            if (missingPartPhotos.length > 0) {
                return `Photo verification required for installed parts: ${missingPartPhotos.map(p => p.partName).join(", ")}`;
            }

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

            // Validate Photo Requirements (Repair verification photos are optional per user request)

            return null;
        },
    },
    VEHICLE_RELEASED: {
        allowedFrom: ["READY_FOR_RELEASE"],
        allowedRoles: [ROLES.WORKSHOPSTAFF, ROLES.OPERATIONSTAFF],
        minHierarchy: ROLES.BRANCHMANAGER,
        gateValidator: async (wo, payload) => {
            if (!payload.odometerAtRelease && !wo.odometerAtRelease) {
                return "Final odometer reading is required for vehicle release.";
            }

            // Enforce Payment before Release
            if (!wo.serviceBillId) {
                return "A service bill must be generated and linked before vehicle release.";
            }

            const { ServiceBill } = require("../../ServiceBill/Model/ServiceBillModel");
            const bill = await ServiceBill.findById(wo.serviceBillId);
            
            if (!bill) {
                return "Linked service bill not found.";
            }

            if (bill.paymentStatus !== "PAID") {
                const balance = (bill.totalAmount || 0) - (bill.amountPaid || 0);
                return `Vehicle cannot be released. Bill ${bill.billNumber} is not fully paid. Outstanding balance: $${balance.toLocaleString()}.`;
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

    // Automated Labour Tracking side-effects disabled as actualLabourHours is now entered manually.
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
