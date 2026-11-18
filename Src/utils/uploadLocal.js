const fs = require("fs");
const path = require("path");

/**
 * Upload a file buffer to local disk and return the relative URL path.
 * Falls back to local storage when AWS credentials are not configured.
 * @param {Object} file - Multer file object (has buffer, originalname, mimetype)
 * @param {string} folder - Target subfolder inside uploads/
 * @param {Object} [actorOrReq] - Optional request or actor user object for upload tracking
 * @param {Object} [options] - Optional metadata (module, entityId, entityReference, notes)
 * @returns {string} - Relative URL path (e.g. /uploads/purchase-orders/...)
 */
const uploadLocal = (file, folder = "uploads", actorOrReq = null, options = {}) => {
  const timestamp = Date.now();
  const sanitizedFileName = file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, "_");
  const relativePath = `${folder}/${timestamp}_${sanitizedFileName}`;

  // Ensure the directory exists
  const uploadDir = path.join(__dirname, "../../uploads", folder);
  fs.mkdirSync(uploadDir, { recursive: true });

  // Write file buffer to disk
  const filePath = path.join(uploadDir, `${timestamp}_${sanitizedFileName}`);
  fs.writeFileSync(filePath, file.buffer);

  const fileUrl = `/uploads/${relativePath}`;

  // Automatic upload tracking if actor or request is provided
  if (actorOrReq) {
    try {
      const { trackUpload } = require("../modules/StaffPerformance/Service/staffActivityService");
      const actor = actorOrReq.user || actorOrReq;
      let moduleName = options.module;
      if (!moduleName) {
        const upperFolder = folder.toUpperCase();
        if (upperFolder.includes("INVOICE")) moduleName = "INVOICE";
        else if (upperFolder.includes("BILL")) moduleName = "BILL";
        else if (upperFolder.includes("DEBIT")) moduleName = "DEBIT_NOTE";
        else if (upperFolder.includes("CREDIT")) moduleName = "CREDIT_NOTE";
        else if (upperFolder.includes("BANK") || upperFolder.includes("STATEMENT")) moduleName = "BANK_STATEMENT";
        else if (upperFolder.includes("PAYMENT")) moduleName = "BANK_PAYMENT_PROOF";
        else moduleName = "GENERAL";
      }

      trackUpload({
        file,
        fileUrl,
        storageType: "LOCAL",
        module: moduleName,
        entityId: options.entityId,
        entityReference: options.entityReference,
        actor,
        notes: options.notes,
        metadata: options.metadata || {}
      }).catch(err => console.error("[uploadLocal] Async track error:", err.message));
    } catch (trackErr) {
      // Non-blocking tracking
    }
  }

  return fileUrl;
};

module.exports = uploadLocal;
