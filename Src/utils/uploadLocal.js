const fs = require("fs");
const path = require("path");

/**
 * Upload a file buffer to local disk and return the relative URL path.
 * Falls back to local storage when AWS credentials are not configured.
 * @param {Object} file - Multer file object (has buffer, originalname, mimetype)
 * @param {string} folder - Target subfolder inside uploads/
 * @returns {string} - Relative URL path (e.g. /uploads/purchase-orders/...)
 */
const uploadLocal = (file, folder = "uploads") => {
  const timestamp = Date.now();
  const sanitizedFileName = file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, "_");
  const relativePath = `${folder}/${timestamp}_${sanitizedFileName}`;

  // Ensure the directory exists
  const uploadDir = path.join(__dirname, "../../uploads", folder);
  fs.mkdirSync(uploadDir, { recursive: true });

  // Write file buffer to disk
  const filePath = path.join(uploadDir, `${timestamp}_${sanitizedFileName}`);
  fs.writeFileSync(filePath, file.buffer);

  return `/uploads/${relativePath}`;
};

module.exports = uploadLocal;
