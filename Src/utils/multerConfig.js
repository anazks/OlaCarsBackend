const multer = require("multer");

// Set up memory storage so we can access file.buffer for AWS S3
const storage = multer.memoryStorage();

const upload = multer({
    storage,
    limits: {
        fileSize: 20 * 1024 * 1024, // 20 MB limit
    },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith("image/") || file.mimetype === "application/pdf") {
            cb(null, true);
        } else {
            cb(new Error("Only image and PDF files are allowed!"), false);
        }
    },
});

module.exports = upload;
