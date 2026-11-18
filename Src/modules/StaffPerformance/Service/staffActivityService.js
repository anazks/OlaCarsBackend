const mongoose = require("mongoose");
const SystemUpload = require("../Model/SystemUploadModel");
const StaffActivityLog = require("../Model/StaffActivityLogModel");

/**
 * Safely extract user info from req.user or actor object
 */
const extractActor = (actor) => {
    if (!actor) return null;
    const id = actor._id || actor.id;
    if (!id) return null;

    const role = actor.role || actor.userRole || "USER";
    const name = actor.fullName || actor.name || actor.email || "System User";
    const email = actor.email || "";
    const branchId = actor.branchId || actor.branch || null;

    return { id, role, name, email, branchId };
};

/**
 * Log any daily work activity done by an employee/account
 */
const logActivity = async (payload) => {
    try {
        const {
            actor,
            user,
            action,
            entityType,
            entityId,
            entityIdentifier,
            amount = 0,
            description = "",
            fileUrl = "",
            fileName = "",
            branchId,
            metadata = {},
            timestamp = new Date()
        } = payload;

        const effectiveActor = extractActor(actor || user);
        if (!effectiveActor) {
            // Unattributed or system action
            return null;
        }

        const logEntry = new StaffActivityLog({
            userId: effectiveActor.id,
            userRole: effectiveActor.role,
            userName: effectiveActor.name,
            userEmail: effectiveActor.email,
            branchId: branchId || effectiveActor.branchId,
            action,
            entityType,
            entityId: entityId ? new mongoose.Types.ObjectId(entityId) : undefined,
            entityIdentifier: entityIdentifier || "",
            amount: Number(amount) || 0,
            description: description || `${action} ${entityType}`,
            fileUrl,
            fileName,
            metadata,
            timestamp
        });

        await logEntry.save();
        return logEntry;
    } catch (err) {
        // Logging should never crash the main transaction
        console.error("[StaffActivityService] Error logging activity:", err.message);
        return null;
    }
};

/**
 * Track an upload executed anywhere in the system
 */
const trackUpload = async (uploadData) => {
    try {
        const {
            file,
            fileUrl,
            storageType = "LOCAL",
            module = "GENERAL",
            entityId,
            entityModel,
            entityReference,
            actor,
            user,
            branchId,
            notes,
            metadata = {}
        } = uploadData;

        const effectiveActor = extractActor(actor || user);
        if (!effectiveActor) {
            return null;
        }

        const originalName = file?.originalname || uploadData.originalName || "uploaded_file";
        const mimeType = file?.mimetype || uploadData.mimeType || "";
        const fileSize = file?.size || file?.buffer?.length || uploadData.fileSize || 0;

        const uploadRecord = new SystemUpload({
            originalName,
            fileUrl,
            storageType,
            mimeType,
            fileSize,
            module,
            entityId: entityId ? new mongoose.Types.ObjectId(entityId) : undefined,
            entityModel,
            entityReference: entityReference || "",
            uploadedBy: effectiveActor.id,
            uploaderRole: effectiveActor.role,
            uploaderName: effectiveActor.name,
            branchId: branchId || effectiveActor.branchId,
            status: "SUCCESS",
            notes,
            metadata
        });

        await uploadRecord.save();

        // Also record an activity log entry for the upload
        await logActivity({
            actor: effectiveActor,
            action: "UPLOAD",
            entityType: module === "BANK_STATEMENT" ? "BANK_STATEMENT" : "UPLOAD",
            entityId: entityId || uploadRecord._id,
            entityIdentifier: entityReference || originalName,
            description: `Uploaded ${originalName} (${module})`,
            fileUrl,
            fileName: originalName,
            branchId: branchId || effectiveActor.branchId,
            metadata: { uploadId: uploadRecord._id, module, fileSize, mimeType }
        });

        return uploadRecord;
    } catch (err) {
        console.error("[StaffActivityService] Error tracking upload:", err.message);
        return null;
    }
};

module.exports = {
    logActivity,
    trackUpload,
    extractActor
};

