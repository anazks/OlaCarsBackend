const multer = require("multer");

// Set up memory storage so we can access file.buffer for AWS S3
const storage = multer.memoryStorage();

const upload = multer({
    storage,
    limits: {
        fileSize: 5 * 1024 * 1024, // 5 MB limit
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = ["image/", "application/pdf"];
        if (allowedTypes.some((type) => file.mimetype.startsWith(type))) {
            cb(null, true);
        } else {
            cb(new Error("Only image and PDF files are allowed!"), false);
        }
    },
});

module.exports = upload;
