const express = require("express");
const router = express.Router();
const { downloadFile } = require("../Controller/FileController");

// Forced download endpoint
router.get("/download", downloadFile);

module.exports = router;
