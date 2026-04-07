const { getWorkOrderById, updateWorkOrder } = require("../../WorkOrder/Repo/WorkOrderRepo");
const { WorkOrder } = require("../../WorkOrder/Model/WorkOrderModel");

// ─── QC Checklist Templates ─────────────────────────────────────────

const QC_TEMPLATES = {
    PREVENTIVE: [
        { checkItem: "Engine oil level and condition", category: "Fluids" },
        { checkItem: "Coolant level", category: "Fluids" },
        { checkItem: "Brake fluid level", category: "Fluids" },
        { checkItem: "Tyre pressure and tread depth", category: "Tyres" },
        { checkItem: "Battery voltage and terminals", category: "Electrical" },
        { checkItem: "All lights functional", category: "Electrical" },
        { checkItem: "Brake pads condition", category: "Brakes" },
        { checkItem: "Suspension visual check", category: "Suspension" },
        { checkItem: "Belt condition", category: "Engine" },
        { checkItem: "General body condition", category: "Body" },
    ],
    CORRECTIVE: [
        { checkItem: "Reported fault resolved", category: "Repair" },
        { checkItem: "No new leaks or noises", category: "General" },
        { checkItem: "Test drive completed", category: "General" },
        { checkItem: "All lights functional", category: "Electrical" },
        { checkItem: "Brake test passed", category: "Brakes" },
        { checkItem: "General body condition", category: "Body" },
    ],
    ACCIDENT: [
        { checkItem: "All repairs completed per estimate", category: "Body" },
        { checkItem: "Paint finish acceptable", category: "Body" },
        { checkItem: "Panel alignment correct", category: "Body" },
        { checkItem: "Structural integrity verified", category: "Body" },
        { checkItem: "All lights functional", category: "Electrical" },
        { checkItem: "Test drive — brakes, steering, suspension", category: "General" },
        { checkItem: "No fluid leaks", category: "Fluids" },
        { checkItem: "Safety systems operational", category: "Safety" },
    ],
    DEFAULT: [
        { checkItem: "Work completed as specified", category: "General" },
        { checkItem: "No new damage or issues", category: "General" },
        { checkItem: "Test drive completed", category: "General" },
        { checkItem: "Vehicle clean and presentable", category: "General" },
        { checkItem: "All lights functional", category: "Electrical" },
    ],
};

/**
 * Get the QC template for a work order type.
 */
const getQcTemplate = (workOrderType) => {
    return QC_TEMPLATES[workOrderType] || QC_TEMPLATES.DEFAULT;
};

/**
 * Auto-generate QC checklist for a work order (populates qcChecklist sub-array).
 * @param {string} woId
 * @returns {Promise<Object>}
 */
const generateQcChecklist = async (woId) => {
    const wo = await WorkOrder.findById(woId);
    if (!wo) throw new Error("Work order not found.", { cause: 404 });

    if (wo.qcChecklist && wo.qcChecklist.length > 0) {
        throw new Error("QC checklist already exists for this work order.", { cause: 400 });
    }

    const template = getQcTemplate(wo.workOrderType);
    wo.qcChecklist = template.map((item) => ({
        checkItem: item.checkItem,
        category: item.category,
        result: "PENDING",
    }));

    await wo.save();
    return wo;
};

/**
 * Submit QC results for a work order.
 * @param {string} woId
 * @param {Array}  results - [{ checkItem, result, notes, checkedBy }]
 * @param {Object} inspector - { id, role }
 * @returns {Promise<{ wo, passed }>}
 */
const submitQcResults = async (woId, results, inspector) => {
    const wo = await WorkOrder.findById(woId);
    if (!wo) throw new Error("Work order not found.", { cause: 404 });

    if (wo.status !== "QUALITY_CHECK") {
        throw new Error("Work order must be in QUALITY_CHECK status.", { cause: 400 });
    }

    // Update each checklist item
    for (const result of results) {
        const item = wo.qcChecklist.find((qc) => qc.checkItem === result.checkItem);
        if (item) {
            item.result = result.result; // PASS, FAIL, NA
            item.notes = result.notes || "";
            item.checkedBy = inspector.id;
            item.checkedAt = new Date();
        }
    }

    // Check if all items are assessed
    const pending = wo.qcChecklist.filter((qc) => qc.result === "PENDING");
    if (pending.length > 0) {
        await wo.save();
        return {
            wo,
            passed: null,
            pending: pending.map((p) => p.checkItem),
            message: `${pending.length} items still pending.`,
        };
    }

    // Check pass/fail
    const failed = wo.qcChecklist.filter((qc) => qc.result === "FAIL");
    const passed = failed.length === 0;

    await wo.save();
    return { wo, passed, failedItems: failed.map((f) => f.checkItem) };
};

// ─── S3 Photo Upload Helpers ─────────────────────────────────────────

/**
 * Add photo metadata to a work order.
 * Actual S3 upload should be done at the controller/middleware level.
 * This stores the reference.
 * @param {string} woId
 * @param {Object} photoData - { url, caption, stage, uploadedBy }
 */
const addWorkOrderPhoto = async (woId, photoData) => {
    const wo = await WorkOrder.findById(woId);
    if (!wo) throw new Error("Work order not found.", { cause: 404 });

    if (!wo.photos) wo.photos = [];

    wo.photos.push({
        url: photoData.url,
        caption: photoData.caption || "",
        stage: photoData.stage || "IN_PROGRESS", // CHECK_IN, IN_PROGRESS, QC, RELEASE
        uploadedBy: photoData.uploadedBy,
        uploadedAt: new Date(),
    });

    await wo.save();
    return wo;
};

/**
 * Remove a photo from a work order.
 * @param {string} woId
 * @param {string} photoId
 */
const removeWorkOrderPhoto = async (woId, photoId) => {
    const wo = await WorkOrder.findById(woId);
    if (!wo) throw new Error("Work order not found.", { cause: 404 });

    const photoIndex = wo.photos.findIndex((p) => p._id.toString() === photoId);
    if (photoIndex === -1) {
        throw new Error("Photo not found in work order.", { cause: 404 });
    }

    wo.photos.splice(photoIndex, 1);
    await wo.save();
    return wo;
};

// ─── Vehicle Release ─────────────────────────────────────────────────

/**
 * Execute vehicle release logic.
 * - Validates QC passed
 * - Sets odometerAtRelease
 * - Syncs vehicle status back to ACTIVE
 * @param {string} woId
 * @param {Object} releaseData - { odometerAtRelease, releaseNotes }
 * @param {Object} user - { id, role }
 */
const executeVehicleRelease = async (woId, releaseData, user) => {
    const wo = await WorkOrder.findById(woId);
    if (!wo) throw new Error("Work order not found.", { cause: 404 });

    if (wo.status !== "READY_FOR_RELEASE") {
        throw new Error("Work order must be in READY_FOR_RELEASE status to release vehicle.", { cause: 400 });
    }

    // Verify QC passed
    if (wo.qcChecklist && wo.qcChecklist.length > 0) {
        const failed = wo.qcChecklist.filter((qc) => qc.result === "FAIL");
        if (failed.length > 0) {
            throw new Error(`Cannot release: ${failed.length} QC item(s) failed.`, { cause: 400 });
        }
    }

    // Double check Mandatory Photos
    const requiredPhotos = wo.requiredPhotos || [];
    const uploadedPhotos = wo.photos || [];
    const missingMandatory = requiredPhotos.filter(rp => 
        rp.isMandatory && !uploadedPhotos.some(up => up.caption === rp.label)
    );

    if (missingMandatory.length > 0) {
        throw new Error(`Cannot release: Mandatory photos missing (${missingMandatory.map(m => m.label).join(", ")}).`, { cause: 400 });
    }

    // Verify Payment Completed
    if (!wo.serviceBillId) {
        throw new Error("Cannot release vehicle: Service bill has not been generated.", { cause: 400 });
    }
    const { ServiceBill } = require("../../ServiceBill/Model/ServiceBillModel");
    const bill = await ServiceBill.findById(wo.serviceBillId);
    if (!bill) {
        throw new Error("Cannot release vehicle: Associated service bill not found.", { cause: 404 });
    }
    if (bill.paymentStatus !== "PAID") {
        throw new Error("Cannot release vehicle: Payment is not completed.", { cause: 400 });
    }

    // Update work order
    wo.odometerAtRelease = releaseData.odometerAtRelease || wo.odometerAtRelease;
    wo.releaseNotes = releaseData.releaseNotes || "";
    wo.releasedBy = user.id;
    wo.releasedAt = new Date();
    wo.status = "VEHICLE_RELEASED";

    // Add to status history
    wo.statusHistory.push({
        status: "VEHICLE_RELEASED",
        changedBy: user.id,
        changedByRole: user.role,
        timestamp: new Date(),
        notes: releaseData.releaseNotes || "Vehicle released",
    });

    await wo.save();

    // Sync vehicle status back to ACTIVE (if Vehicle model is accessible)
    try {
        const Vehicle = require("../../Vehicle/Model/VehicleModel");
        if (Vehicle && wo.vehicleId) {
            await Vehicle.findByIdAndUpdate(wo.vehicleId, {
                $set: { "statusTracking.currentStatus": "ACTIVE" },
            });
        }
    } catch (err) {
        // Non-critical — log but don't fail the release
        console.warn("Vehicle status sync warning:", err.message);
    }

    return wo;
};

module.exports = {
    QC_TEMPLATES,
    getQcTemplate,
    generateQcChecklist,
    submitQcResults,
    addWorkOrderPhoto,
    removeWorkOrderPhoto,
    executeVehicleRelease,
};
