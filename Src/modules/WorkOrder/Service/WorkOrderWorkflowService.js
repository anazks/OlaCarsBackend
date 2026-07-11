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
    TASKS: {
        allowedFrom: [],
        allowedRoles: [ROLES.WORKSHOPSTAFF, ROLES.OPERATIONSTAFF, ROLES.WORKSHOPMANAGER, ROLES.BRANCHMANAGER, ROLES.ADMIN],
        minHierarchy: ROLES.BRANCHMANAGER,
    },
    LABOUR: {
        allowedFrom: ["TASKS", "QC_PHOTOS"],
        allowedRoles: [ROLES.WORKSHOPSTAFF, ROLES.OPERATIONSTAFF, ROLES.WORKSHOPMANAGER, ROLES.BRANCHMANAGER, ROLES.ADMIN],
        minHierarchy: ROLES.BRANCHMANAGER,
        gateValidator: (wo, payload) => {
            const doableTasks = (wo.tasks || []).filter(t => t.isDoable);
            if (doableTasks.length === 0) {
                return "At least one task must be selected before proceeding to Labour.";
            }
            return null;
        },
    },
    QC_PHOTOS: {
        allowedFrom: ["LABOUR"],
        allowedRoles: [ROLES.WORKSHOPSTAFF, ROLES.OPERATIONSTAFF, ROLES.WORKSHOPMANAGER, ROLES.BRANCHMANAGER, ROLES.ADMIN],
        minHierarchy: ROLES.BRANCHMANAGER,
        gateValidator: (wo, payload) => {
            if (!wo.actualLabourHours || wo.actualLabourHours <= 0) {
                return "Work start and end times must be updated (actual labour hours must be greater than 0) before proceeding to QC & Photos.";
            }
            return null;
        },
    },
    BILLING: {
        allowedFrom: ["QC_PHOTOS"],
        allowedRoles: [ROLES.WORKSHOPSTAFF, ROLES.OPERATIONSTAFF, ROLES.WORKSHOPMANAGER, ROLES.BRANCHMANAGER, ROLES.ADMIN],
        minHierarchy: ROLES.BRANCHMANAGER,
        gateValidator: (wo, payload) => {
            const tasks = wo.tasks || [];
            const incompleteTasks = tasks.filter(
                (t) => t.isDoable && t.status !== "COMPLETED" && t.status !== "SKIPPED"
            );
            if (tasks.length > 0 && incompleteTasks.length > 0) {
                return `${incompleteTasks.length} task(s) are still incomplete. All tasks must be completed or skipped before Billing.`;
            }

            return null;
        },
    },
    CANCELLED: {
        allowedFrom: ["TASKS", "LABOUR", "QC_PHOTOS"],
        allowedRoles: [ROLES.BRANCHMANAGER, ROLES.WORKSHOPMANAGER, ROLES.ADMIN],
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
    if (targetStatus === "LABOUR") {
        console.log(`[WorkOrder] WO ${workOrder.workOrderNumber} active. Ready for labour tracking.`);
    }

    if (targetStatus === "BILLING") {
        console.log(`[WorkOrder] Vehicle ready for billing/release from WO ${workOrder.workOrderNumber}.`);
    }

    if (targetStatus === "CANCELLED") {
        console.log(`[WorkOrder] WO ${workOrder.workOrderNumber} cancelled. Releasing reserved inventory.`);
    }

    // Automated Labour Tracking side-effects disabled as actualLabourHours is now entered manually.
};

const mapLegacyStatus = (status) => {
    if (["DRAFT", "START", "VEHICLE_CHECKED_IN", "PARTS_REQUESTED", "PARTS_RECEIVED"].includes(status)) {
        return "TASKS";
    }
    if (["IN_PROGRESS", "PAUSED", "ADDITIONAL_WORK_FOUND"].includes(status)) {
        return "LABOUR";
    }
    if (["QUALITY_CHECK", "FAILED_QC", "READY_FOR_RELEASE"].includes(status)) {
        return "QC_PHOTOS";
    }
    if (["VEHICLE_RELEASED", "INVOICED", "CLOSED"].includes(status)) {
        return "BILLING";
    }
    return status;
};

// ─── Main Workflow Engine ────────────────────────────────────────────

const processWorkOrderProgress = async (woId, targetStatus, updateData, user) => {
    const currentWO = await getWorkOrderById(woId);
    if (!currentWO) throw new Error("Work order not found.", { cause: 404 });

    if (!WORK_ORDER_STATUSES.includes(targetStatus)) {
        throw new Error("Invalid target status provided.", { cause: 400 });
    }

    const currentStatusMapped = mapLegacyStatus(currentWO.status);

    if (currentWO.status === targetStatus || currentStatusMapped === targetStatus) {
        const payload = { ...updateData, status: targetStatus };
        const updatedWO = await updateWorkOrder(woId, payload);
        updatedWO.statusHistory.push({
            status: targetStatus,
            changedBy: user.id,
            changedByRole: user.role,
            notes: updateData?.notes || `Status migrated to ${targetStatus}`,
        });
        await updatedWO.save();
        await triggerSideEffects(targetStatus, updatedWO, user);
        return updatedWO;
    }

    const rule = STATUS_RULES[targetStatus];
    if (!rule) throw new Error("Invalid target status configuration.", { cause: 500 });

    if (!rule.allowedFrom.includes(currentStatusMapped)) {
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

    if (targetStatus === "LABOUR") {
        payload.costApproval = {
            approvedBy: user.id,
            approvedByRole: user.role,
            approvedAt: new Date(),
            thresholdLevel: "NONE",
        };
    }

    if (targetStatus === "LABOUR" && !payload.odometerAtEntry && !currentWO.odometerAtEntry) {
        const vehicleOdo = currentWO.vehicleId?.basicDetails?.odometer;
        if (vehicleOdo) payload.odometerAtEntry = vehicleOdo;
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
