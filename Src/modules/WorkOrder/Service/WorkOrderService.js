const { getWorkOrderById, updateWorkOrder } = require("../Repo/WorkOrderRepo");
const { WorkOrder } = require("../Model/WorkOrderModel");

// ─── Task Management ─────────────────────────────────────────────────

/**
 * Add a task to a work order.
 * @param {string} woId
 * @param {Object} taskData - { description, category, assignedTo, estimatedHours, notes }
 * @returns {Promise<Object>}
 */
const addTask = async (woId, taskData) => {
    const wo = await WorkOrder.findById(woId);
    if (!wo) throw new Error("Work order not found.", { cause: 404 });

    wo.tasks.push(taskData);
    await wo.save();
    return wo;
};

/**
 * Update a specific task within a work order.
 * @param {string} woId
 * @param {string} taskId - Sub-document _id
 * @param {Object} updates - { status, actualHours, notes, completedAt }
 * @returns {Promise<Object>}
 */
const updateTask = async (woId, taskId, updates) => {
    const wo = await WorkOrder.findById(woId);
    if (!wo) throw new Error("Work order not found.", { cause: 404 });

    const task = wo.tasks.id(taskId);
    if (!task) throw new Error("Task not found.", { cause: 404 });

    if (updates.status) task.status = updates.status;
    if (updates.actualHours !== undefined) task.actualHours = updates.actualHours;
    if (updates.notes !== undefined) task.notes = updates.notes;
    if (updates.assignedTo) task.assignedTo = updates.assignedTo;

    // Auto-set completedAt when marked COMPLETED
    if (updates.status === "COMPLETED" && !task.completedAt) {
        task.completedAt = new Date();
    }

    await wo.save();
    return wo;
};

/**
 * Remove a task from a work order (only if PENDING).
 * @param {string} woId
 * @param {string} taskId
 * @returns {Promise<Object>}
 */
const removeTask = async (woId, taskId) => {
    const wo = await WorkOrder.findById(woId);
    if (!wo) throw new Error("Work order not found.", { cause: 404 });

    const task = wo.tasks.id(taskId);
    if (!task) throw new Error("Task not found.", { cause: 404 });
    if (task.status !== "PENDING") {
        throw new Error("Only PENDING tasks can be removed.", { cause: 400 });
    }

    wo.tasks.pull(taskId);
    await wo.save();
    return wo;
};

// ─── Parts Management ────────────────────────────────────────────────

/**
 * Add a part to a work order.
 * @param {string} woId
 * @param {Object} partData - { partName, partNumber, quantity, unitCost, source, inventoryPartId }
 * @param {Object} user - Performing user { id, role }
 * @returns {Promise<Object>}
 */
const addPart = async (woId, partData, user) => {
    const wo = await WorkOrder.findById(woId);
    if (!wo) throw new Error("Work order not found.", { cause: 404 });

    // If inventoryPartId is provided and source is IN_STOCK, try to reserve
    if (partData.inventoryPartId && partData.source === "IN_STOCK") {
        const { checkAndReserve } = require("../../Inventory/Service/InventoryService");
        const result = await checkAndReserve(partData.inventoryPartId, partData.quantity, user, woId);
        
        if (result.success) {
            partData.status = "RESERVED";
            // Sync current cost from inventory if not provided
            if (!partData.unitCost) partData.unitCost = result.part.unitCost;
        } else {
            // If shortfall, we still add it but keep as REQUESTED
            partData.status = "REQUESTED";
        }
    }

    // Auto-calculate totalCost
    partData.totalCost = (partData.quantity || 0) * (partData.unitCost || 0);

    wo.parts.push(partData);

    // Recalculate actualPartsCost
    wo.actualPartsCost = wo.parts.reduce((sum, p) => sum + (p.totalCost || 0), 0);

    await wo.save();
    return wo;
};

/**
 * Update a specific part within a work order.
 * Handles inventory synchronization based on status changes.
 * @param {string} woId
 * @param {string} partId - Sub-document _id
 * @param {Object} updates - { status, quantity, unitCost, receivedDate, installedBy }
 * @param {Object} user - Performing user { id, role }
 * @returns {Promise<Object>}
 */
const updatePart = async (woId, partId, updates, user) => {
    const wo = await WorkOrder.findById(woId);
    if (!wo) throw new Error("Work order not found.", { cause: 404 });

    const part = wo.parts.id(partId);
    if (!part) throw new Error("Part not found.", { cause: 404 });

    const oldStatus = part.status;
    const newStatus = updates.status;

    // Handle Inventory Transitions
    if (part.inventoryPartId && newStatus && oldStatus !== newStatus) {
        const {
            checkAndReserve,
            releaseReservation,
            confirmInstallation,
            confirmReturn,
        } = require("../../Inventory/Service/InventoryService");

        // REQUESTED -> RESERVED
        if (oldStatus === "REQUESTED" && newStatus === "RESERVED") {
            const result = await checkAndReserve(part.inventoryPartId, part.quantity, user, woId);
            if (!result.success) throw new Error(result.message, { cause: 400 });
        }
        // RESERVED -> INSTALLED
        else if (oldStatus === "RESERVED" && newStatus === "INSTALLED") {
            await confirmInstallation(part.inventoryPartId, part.quantity, user, woId);
        }
        // RESERVED -> REQUESTED (Cancel reservation)
        else if (oldStatus === "RESERVED" && newStatus === "REQUESTED") {
            await releaseReservation(part.inventoryPartId, part.quantity, user, woId);
        }
        // INSTALLED -> RETURNED (Returning to stock after having been installed)
        else if (oldStatus === "INSTALLED" && newStatus === "RETURNED") {
            await confirmReturn(part.inventoryPartId, part.quantity, user, woId);
        }
    }

    if (updates.status) part.status = updates.status;
    if (updates.quantity !== undefined) part.quantity = updates.quantity;
    if (updates.unitCost !== undefined) part.unitCost = updates.unitCost;
    if (updates.receivedDate) part.receivedDate = updates.receivedDate;
    if (updates.installedBy) part.installedBy = updates.installedBy;
    if (updates.source) part.source = updates.source;

    // Recalculate totalCost for this part
    part.totalCost = (part.quantity || 0) * (part.unitCost || 0);

    // Recalculate actualPartsCost across all parts
    wo.actualPartsCost = wo.parts.reduce((sum, p) => sum + (p.totalCost || 0), 0);

    await wo.save();
    return wo;
};

/**
 * Remove a part from a work order.
 * Releases inventory reservation if necessary.
 * @param {string} woId
 * @param {string} partId
 * @param {Object} user - Performing user { id, role }
 * @returns {Promise<Object>}
 */
const removePart = async (woId, partId, user) => {
    const wo = await WorkOrder.findById(woId);
    if (!wo) throw new Error("Work order not found.", { cause: 404 });

    const part = wo.parts.id(partId);
    if (!part) throw new Error("Part not found.", { cause: 404 });

    // Release reservation if it was reserved
    if (part.inventoryPartId && part.status === "RESERVED") {
        const { releaseReservation } = require("../../Inventory/Service/InventoryService");
        await releaseReservation(part.inventoryPartId, part.quantity, user, woId);
    }

    // Only allow removal if not yet INSTALLED (unless specifically handled)
    if (part.status === "INSTALLED") {
        throw new Error("Cannot remove a part that has already been installed. Return it first.", { cause: 400 });
    }

    wo.parts.pull(partId);
    wo.actualPartsCost = wo.parts.reduce((sum, p) => sum + (p.totalCost || 0), 0);

    await wo.save();
    return wo;
};

// ─── Labour Tracking ─────────────────────────────────────────────────

/**
 * Log a labour entry (CLOCK_IN, CLOCK_OUT, PAUSE, RESUME).
 * @param {string} woId
 * @param {Object} entry - { technicianId, action, taskReference, notes }
 * @returns {Promise<Object>}
 */
const logLabourEntry = async (woId, entry) => {
    const wo = await WorkOrder.findById(woId);
    if (!wo) throw new Error("Work order not found.", { cause: 404 });

    // Validate action sequence
    const techLogs = wo.labourLog.filter(
        (log) => log.technicianId.toString() === entry.technicianId.toString()
    );
    const lastAction = techLogs.length > 0 ? techLogs[techLogs.length - 1].action : null;

    const validSequences = {
        null: ["CLOCK_IN"],
        CLOCK_IN: ["CLOCK_OUT", "PAUSE"],
        CLOCK_OUT: ["CLOCK_IN"],
        PAUSE: ["RESUME"],
        RESUME: ["CLOCK_OUT", "PAUSE"],
    };

    const allowed = validSequences[lastAction] || [];
    if (!allowed.includes(entry.action)) {
        throw new Error(
            `Invalid labour action '${entry.action}'. Expected one of: ${allowed.join(", ") || "CLOCK_IN"}.`,
            { cause: 400 }
        );
    }

    entry.timestamp = new Date();
    wo.labourLog.push(entry);

    // Recalculate actual labour hours after CLOCK_OUT
    if (entry.action === "CLOCK_OUT") {
        wo.actualLabourHours = calculateLabourHours(wo.labourLog, entry.technicianId.toString());
    }

    await wo.save();
    return wo;
};

/**
 * Calculate total labour hours for all technicians from the labour log.
 * Sums CLOCK_IN → CLOCK_OUT intervals, subtracting PAUSE → RESUME gaps.
 */
const calculateLabourHours = (labourLog, techId = null) => {
    // Group logs by technician
    const techGroups = {};
    for (const log of labourLog) {
        const tid = log.technicianId.toString();
        if (techId && tid !== techId) continue;
        if (!techGroups[tid]) techGroups[tid] = [];
        techGroups[tid].push(log);
    }

    let totalMs = 0;

    for (const logs of Object.values(techGroups)) {
        let sessionStart = null;
        let pauseStart = null;
        let pausedMs = 0;

        for (const log of logs) {
            const t = new Date(log.timestamp).getTime();
            switch (log.action) {
                case "CLOCK_IN":
                    sessionStart = t;
                    pausedMs = 0;
                    break;
                case "PAUSE":
                    pauseStart = t;
                    break;
                case "RESUME":
                    if (pauseStart) {
                        pausedMs += t - pauseStart;
                        pauseStart = null;
                    }
                    break;
                case "CLOCK_OUT":
                    if (sessionStart) {
                        totalMs += (t - sessionStart) - pausedMs;
                        sessionStart = null;
                        pauseStart = null;
                        pausedMs = 0;
                    }
                    break;
            }
        }
    }

    // Convert ms to hours (2 decimal places)
    return Math.round((totalMs / (1000 * 60 * 60)) * 100) / 100;
};

module.exports = {
    addTask,
    updateTask,
    removeTask,
    addPart,
    updatePart,
    removePart,
    logLabourEntry,
    calculateLabourHours,
};
