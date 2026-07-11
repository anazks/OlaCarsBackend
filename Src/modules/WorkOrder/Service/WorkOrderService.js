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
const updateTask = async (woId, taskId, updates, user = null) => {
    const wo = await WorkOrder.findById(woId);
    if (!wo) throw new Error("Work order not found.", { cause: 404 });

    const task = wo.tasks.id(taskId);
    if (!task) throw new Error("Task not found.", { cause: 404 });

    const oldStatus = task.status;

    if (updates.status) task.status = updates.status;
    if (updates.actualHours !== undefined) task.actualHours = updates.actualHours;
    if (updates.notes !== undefined) task.notes = updates.notes;
    if (updates.assignedTo) task.assignedTo = updates.assignedTo;
    if (updates.isDoable !== undefined) task.isDoable = updates.isDoable;

    // Auto-set completedAt when marked COMPLETED
    if (updates.status === "COMPLETED" && !task.completedAt) {
        task.completedAt = new Date();
    }

    // Sync part status with task status
    if (updates.status && updates.status !== oldStatus) {
        const templateIdStr = task.taskTemplateId?.toString();
        if (templateIdStr) {
            const { confirmInstallation, confirmReturn } = require("../../Inventory/Service/InventoryService");
            const performer = { id: user?.id || user?._id || "system", role: user?.role || "system" };

            if (updates.status === "COMPLETED") {
                // Task is completed: RESERVED -> INSTALLED
                for (const p of wo.parts) {
                    if (p.taskTemplateId && p.taskTemplateId.toString() === templateIdStr && p.status === "RESERVED") {
                        p.status = "INSTALLED";
                        if (p.inventoryPartId) {
                            try {
                                await confirmInstallation(p.inventoryPartId, p.quantity || 1, performer, woId);
                            } catch (err) {
                                console.error(`Failed to confirm installation for part ${p.partName}:`, err);
                            }
                        }
                    }
                }
            } else if (oldStatus === "COMPLETED") {
                // Task was completed, but now moved back: INSTALLED -> RESERVED
                const { checkAndReserve } = require("../../Inventory/Service/InventoryService");
                for (const p of wo.parts) {
                    if (p.taskTemplateId && p.taskTemplateId.toString() === templateIdStr && p.status === "INSTALLED") {
                        p.status = "RESERVED";
                        if (p.inventoryPartId) {
                            try {
                                await confirmReturn(p.inventoryPartId, p.quantity || 1, performer, woId);
                                await checkAndReserve(p.inventoryPartId, p.quantity || 1, performer, woId);
                            } catch (err) {
                                console.error(`Failed to revert installation/reserve for part ${p.partName}:`, err);
                            }
                        }
                    }
                }
            }
        }
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
const removeTask = async (woId, taskId, user = null) => {
    const wo = await WorkOrder.findById(woId);
    if (!wo) throw new Error("Work order not found.", { cause: 404 });

    const task = wo.tasks.id(taskId);
    if (!task) throw new Error("Task not found.", { cause: 404 });
    if (task.status !== "PENDING") {
        throw new Error("Only PENDING tasks can be removed.", { cause: 400 });
    }
    // Clean up parts associated with this task template if it has one
    if (task.taskTemplateId) {
        const templateIdStr = task.taskTemplateId.toString();
        const partsToRemove = wo.parts.filter(p => p.taskTemplateId && p.taskTemplateId.toString() === templateIdStr);
        if (partsToRemove.length > 0) {
            const { releaseReservation, confirmReturn } = require("../../Inventory/Service/InventoryService");
            const performer = { id: user?.id || user?._id || "system", role: user?.role || "system" };
            for (const p of partsToRemove) {
                if (p.inventoryPartId) {
                    try {
                        if (p.status === "RESERVED") {
                            await releaseReservation(p.inventoryPartId, p.quantity || 1, performer, woId);
                        } else if (p.status === "INSTALLED") {
                            await confirmReturn(p.inventoryPartId, p.quantity || 1, performer, woId);
                        }
                    } catch (err) {
                        console.error(`Failed to cleanup inventory for part ${p.partName} during removeTask:`, err);
                    }
                }
            }
        }
        wo.parts = wo.parts.filter(p => {
            const matchesTemplate = p.taskTemplateId && p.taskTemplateId.toString() === templateIdStr;
            return !matchesTemplate;
        });
    }

    wo.tasks.pull(taskId);

    // Recalculate actualPartsCost (only INSTALLED parts)
    wo.actualPartsCost = wo.parts
        .filter(p => p.status === "INSTALLED")
        .reduce((sum, p) => sum + (p.totalCost || 0), 0);

    await wo.save();
    return wo;
};

// ─── Parts Management ────────────────────────────────────────────────

/**
 * Add a part to a work order.
 * If the part is linked to inventory (inventoryPartId provided), stock is
 * deducted immediately and status is set to INSTALLED.
 * @param {string} woId
 * @param {Object} partData - { partName, partNumber, quantity, unitCost, source, inventoryPartId }
 * @param {Object} user - Performing user { id, role }
 * @returns {Promise<Object>}
 */
const addPart = async (woId, partData, user) => {
    const wo = await WorkOrder.findById(woId);
    if (!wo) throw new Error("Work order not found.", { cause: 404 });

    if (partData.inventoryPartId) {
        const { getPartById } = require("../../Inventory/Repo/InventoryPartRepo");

        const inventoryPart = await getPartById(partData.inventoryPartId);
        if (!inventoryPart) throw new Error("Inventory part not found.", { cause: 404 });

        // Sync part details from inventory
        partData.partName = inventoryPart.partName;
        partData.partNumber = inventoryPart.partNumber;
        if (!partData.unitCost) partData.unitCost = inventoryPart.unitCost;

        // Always add in REQUESTED status first (to list them first for manual installation/approval)
        partData.status = "REQUESTED";
    }

    // Auto-calculate totalCost
    partData.totalCost = (partData.quantity || 0) * (partData.unitCost || 0);

    wo.parts.push(partData);

    // Recalculate actualPartsCost (only INSTALLED parts)
    wo.actualPartsCost = wo.parts
        .filter(p => p.status === "INSTALLED")
        .reduce((sum, p) => sum + (p.totalCost || 0), 0);

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

    if (part.inventoryPartId && newStatus && oldStatus !== newStatus) {
        const {
            confirmInstallation,
            confirmDirectInstallation,
            confirmReturn,
        } = require("../../Inventory/Service/InventoryService");

        // REQUESTED -> INSTALLED (direct stock deduction, skip reservation)
        if (oldStatus === "REQUESTED" && newStatus === "INSTALLED") {
            const { getPartById } = require("../../Inventory/Repo/InventoryPartRepo");
            const inventoryPart = await getPartById(part.inventoryPartId);
            if (inventoryPart) {
                // Check if enough on-hand is available (regardless of reservations)
                if (inventoryPart.quantityOnHand < part.quantity) {
                    throw new Error(
                        `Insufficient physical stock for ${inventoryPart.partName}. On Hand: ${inventoryPart.quantityOnHand}, Need: ${part.quantity}.`,
                        { cause: 400 }
                    );
                }
            }
            await confirmDirectInstallation(part.inventoryPartId, part.quantity, user, woId);
        }
        // RESERVED -> INSTALLED (check if enough was reserved)
        else if (oldStatus === "RESERVED" && newStatus === "INSTALLED") {
            const { getPartById } = require("../../Inventory/Repo/InventoryPartRepo");
            const inventoryPart = await getPartById(part.inventoryPartId);
            if (inventoryPart) {
                if (inventoryPart.quantityReserved < part.quantity) {
                    throw new Error(
                        `Insufficient reservation for ${inventoryPart.partName}. Reserved: ${inventoryPart.quantityReserved}, Need: ${part.quantity}.`,
                        { cause: 400 }
                    );
                }
            }
            await confirmInstallation(part.inventoryPartId, part.quantity, user, woId);
        }
        // INSTALLED -> non-INSTALLED (return to stock)
        else if (oldStatus === "INSTALLED" && newStatus !== "INSTALLED") {
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

    // Recalculate actualPartsCost across all parts (only INSTALLED parts)
    wo.actualPartsCost = wo.parts
        .filter(p => p.status === "INSTALLED")
        .reduce((sum, p) => sum + (p.totalCost || 0), 0);

    await wo.save();
    return wo;
};

/**
 * Remove a part from a work order.
 * Returns stock to inventory if the part was already installed.
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

    // Return stock if it was installed from inventory
    if (part.inventoryPartId && part.status === "INSTALLED") {
        const { confirmReturn } = require("../../Inventory/Service/InventoryService");
        await confirmReturn(part.inventoryPartId, part.quantity, user, woId);
    }

    // Release reservation if it was reserved (legacy support)
    if (part.inventoryPartId && part.status === "RESERVED") {
        const { releaseReservation } = require("../../Inventory/Service/InventoryService");
        await releaseReservation(part.inventoryPartId, part.quantity, user, woId);
    }

    wo.parts.pull(partId);
    wo.actualPartsCost = wo.parts
        .filter(p => p.status === "INSTALLED")
        .reduce((sum, p) => sum + (p.totalCost || 0), 0);

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

    // Recalculate total actual labour hours for the whole Work Order
    wo.actualLabourHours = calculateLabourHours(wo.labourLog);

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

        // Sort logs by timestamp to ensure correct calculation
        const sortedLogs = [...logs].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

        for (const log of sortedLogs) {
            const t = new Date(log.timestamp).getTime();
            switch (log.action) {
                case "CLOCK_IN":
                    sessionStart = t;
                    pausedMs = 0;
                    pauseStart = null;
                    break;
                case "PAUSE":
                    if (sessionStart && !pauseStart) {
                        pauseStart = t;
                    }
                    break;
                case "RESUME":
                    if (sessionStart && pauseStart) {
                        pausedMs += t - pauseStart;
                        pauseStart = null;
                    }
                    break;
                case "CLOCK_OUT":
                    if (sessionStart) {
                        let finalPausedMs = pausedMs;
                        if (pauseStart) {
                            finalPausedMs += t - pauseStart;
                        }
                        totalMs += (t - sessionStart) - finalPausedMs;
                        sessionStart = null;
                        pauseStart = null;
                        pausedMs = 0;
                    }
                    break;
            }
        }
    }

    // Convert ms to hours (2 decimal places)
    return Math.max(0, Math.round((totalMs / (1000 * 60 * 60)) * 100) / 100);
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
